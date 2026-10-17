import { addDays } from './dates';
import { convertMinorCeil, normalizedCurrency } from './derive';
import { formatDate, formatMoney, formatUsd, plural } from './format';
import { toleranceBounds, toUsdCentsCeil } from './money';
import { describeMandateAmount } from './rules';
import type {
  ExtractedInvoice,
  Mandate,
  MandateTerms,
  Payee,
  PayeeCategory,
  PayoutDestination,
  PolicyTerms,
} from './schemas';
import type { Decision, RuleId } from './types';

/** Failing rules a human approval can teach the agent (RULES.md, "Teachable rules"). */
export const TEACHABLE_RULES: ReadonlySet<RuleId> = new Set<RuleId>([
  'payee.known',
  'mandate.exists',
  'mandate.amount',
  'mandate.frequency',
  'mandate.period_cap',
  'policy.autonomous_limit',
]);

/** Rules that may be skipped only because the payee or mandate does not exist yet. */
const SKIPPABLE_WHEN_LEARNING: ReadonlySet<RuleId> = new Set<RuleId>([
  'payee.active',
  'payee.destination_matches',
  'mandate.exists',
  'mandate.currency',
  'mandate.amount',
  'mandate.frequency',
  'mandate.period_cap',
]);

export const PROPOSAL_VALIDITY_DAYS = 180;

export interface NewPayeeDraft {
  name: string;
  legalName: string;
  country: string;
  taxId: string | null;
  category: PayeeCategory;
  currency: string;
  destination: PayoutDestination;
}

export interface ProposalChange {
  label: string;
  from: string | null;
  to: string;
}

export type ProposalKind = 'register_payee_and_mandate' | 'create_mandate' | 'update_mandate';

export interface MandateProposalDraft {
  kind: ProposalKind;
  payeeId: string | null;
  newPayee: NewPayeeDraft | null;
  /** Mandate being replaced, for updates. */
  baseMandate: { id: string; key: string; version: number } | null;
  terms: MandateTerms;
  changes: ProposalChange[];
  fixesRules: RuleId[];
  /** Maximum USD the agent could pay this payee per month without asking, once signed. */
  exposureUsdCentsPerMonth: number;
  title: string;
  rationale: string;
  warnings: string[];
}

export interface ProposalInput {
  decision: Decision;
  extraction: ExtractedInvoice;
  policy: PolicyTerms;
  payees: Payee[];
  mandates: Mandate[];
  approvers: string[];
  approvedAt: string;
}

function roundUpToWholeUsd(usdCents: number): number {
  return Math.ceil(usdCents / 100) * 100;
}

function amountTermsFor(
  category: PayeeCategory,
  amountMinor: number,
): { amount: MandateTerms['amount']; cap: number } {
  if (category === 'contractor' || category === 'facilities') {
    return { amount: { kind: 'fixed', amountMinor, tolerancePct: 0 }, cap: amountMinor };
  }
  if (category === 'software') {
    const tolerancePct = 10;
    return {
      amount: { kind: 'fixed', amountMinor, tolerancePct },
      cap: toleranceBounds(amountMinor, tolerancePct).max,
    };
  }
  return { amount: { kind: 'up_to', maxMinor: amountMinor }, cap: amountMinor };
}

/** Whether the human-approved decision can be turned into a proposal at all. */
export function isTeachable(decision: Decision): boolean {
  if (decision.outcome !== 'ESCALATE') return false;
  if (decision.facts.payeeMatch === 'conflict') return false;
  const fails = decision.results.filter((r) => r.status === 'fail');
  if (fails.length === 0) return false;
  if (!fails.every((r) => TEACHABLE_RULES.has(r.id))) return false;
  const unsafeSkips = decision.results.filter((r) => r.status === 'skip' && !r.safeSkip);
  return unsafeSkips.every((r) => SKIPPABLE_WHEN_LEARNING.has(r.id));
}

/**
 * After a person approves an escalated bill, propose the mandate change that would have let the
 * agent pay it alone (ADR-0004). Returns null when the escalation is not teachable. The proposal
 * has no effect until a person with signing rights accepts it.
 */
export function proposeFromApproval(input: ProposalInput): MandateProposalDraft | null {
  const { decision, extraction, policy } = input;
  if (!isTeachable(decision)) return null;
  const f = decision.facts;
  const currency = normalizedCurrency(f.currency);
  if (!currency || f.amountMinor === null || f.usdCents === null) return null;

  const failing = new Set(decision.results.filter((r) => r.status === 'fail').map((r) => r.id));
  const validFrom = f.decisionDate;
  const validUntil = addDays(validFrom, PROPOSAL_VALIDITY_DAYS);
  const approvedBy = input.approvers.join(' y ');
  const warnings: string[] = [];

  let kind: ProposalKind;
  let terms: MandateTerms;
  let payeeName: string;
  let newPayee: NewPayeeDraft | null = null;
  let baseMandate: MandateProposalDraft['baseMandate'] = null;
  const changes: ProposalChange[] = [];

  const overrideFor = (limitOverride: number | null) =>
    f.usdCents! > policy.autonomousLimitUsdCents
      ? Math.max(roundUpToWholeUsd(f.usdCents!), limitOverride ?? 0)
      : limitOverride;

  if (failing.has('payee.known')) {
    const destination = extraction.payout.destination;
    const method = extraction.payout.method;
    const name = extraction.issuer.name;
    if (!destination || !method || !name) return null;
    const category = extraction.category ?? 'services';
    const { amount, cap } = amountTermsFor(category, f.amountMinor);
    kind = 'register_payee_and_mandate';
    payeeName = name;
    newPayee = {
      name,
      legalName: name,
      country: (extraction.issuer.country ?? '').toUpperCase().slice(0, 2) || 'XX',
      taxId: extraction.issuer.taxId,
      category,
      currency,
      destination: { method, value: destination, bankName: extraction.payout.bankName },
    };
    terms = {
      currency,
      amount,
      periodCapMinor: cap,
      maxInvoicesPerPeriod: 1,
      autonomousLimitOverrideUsdCents: overrideFor(null),
      validFrom,
      validUntil,
      note: `Propuesto por el agente tras la aprobación de ${approvedBy}.`,
    };
    changes.push(
      { label: 'Beneficiario nuevo', from: null, to: `${name} (${newPayee.country})` },
      { label: 'Destino de pago', from: null, to: destination },
      { label: 'Monto acordado', from: null, to: describeMandateAmount(terms) },
      { label: 'Tope mensual', from: null, to: formatMoney(cap, currency) },
    );
    warnings.push(
      'Verifica los datos de pago de este beneficiario por otro canal antes de firmar: se registrarán tal como vienen en la factura.',
    );
  } else if (failing.has('mandate.exists')) {
    const payee = input.payees.find((p) => p.id === f.payeeId);
    if (!payee) return null;
    const { amount, cap } = amountTermsFor(payee.category, f.amountMinor);
    kind = 'create_mandate';
    payeeName = payee.name;
    terms = {
      currency,
      amount,
      periodCapMinor: cap,
      maxInvoicesPerPeriod: 1,
      autonomousLimitOverrideUsdCents: overrideFor(null),
      validFrom,
      validUntil,
      note: `Propuesto por el agente tras la aprobación de ${approvedBy}.`,
    };
    changes.push(
      { label: 'Acuerdo nuevo con', from: null, to: payee.name },
      { label: 'Monto acordado', from: null, to: describeMandateAmount(terms) },
      { label: 'Tope mensual', from: null, to: formatMoney(cap, currency) },
    );
  } else {
    const mandate = input.mandates.find((m) => m.id === f.mandateId);
    const payee = input.payees.find((p) => p.id === f.payeeId);
    if (!mandate || !payee || mandate.terms.currency !== currency) return null;
    kind = 'update_mandate';
    payeeName = payee.name;
    baseMandate = { id: mandate.id, key: mandate.key, version: mandate.version };
    const old = mandate.terms;
    const next: MandateTerms = {
      ...old,
      note: `Ajuste propuesto por el agente tras la aprobación de ${approvedBy}.`,
    };

    if (failing.has('mandate.amount')) {
      next.amount =
        old.amount.kind === 'fixed'
          ? { ...old.amount, amountMinor: f.amountMinor }
          : { kind: 'up_to', maxMinor: f.amountMinor };
      changes.push({
        label: 'Monto acordado',
        from: describeMandateAmount(old),
        to: describeMandateAmount(next),
      });
    }
    if (failing.has('mandate.frequency')) {
      next.maxInvoicesPerPeriod = f.payeeMonthCountBefore + 1;
      changes.push({
        label: 'Facturas por mes',
        from: String(old.maxInvoicesPerPeriod),
        to: String(next.maxInvoicesPerPeriod),
      });
    }
    const perInvoiceMax =
      next.amount.kind === 'fixed'
        ? toleranceBounds(next.amount.amountMinor, next.amount.tolerancePct).max
        : next.amount.maxMinor;
    const neededCap = Math.max(
      old.periodCapMinor,
      perInvoiceMax * next.maxInvoicesPerPeriod,
      failing.has('mandate.period_cap') ? f.payeeMonthAmountMinorBefore + f.amountMinor : 0,
    );
    if (neededCap !== old.periodCapMinor) {
      next.periodCapMinor = neededCap;
      changes.push({
        label: 'Tope mensual',
        from: formatMoney(old.periodCapMinor, currency),
        to: formatMoney(neededCap, currency),
      });
    }
    if (failing.has('policy.autonomous_limit')) {
      next.autonomousLimitOverrideUsdCents = overrideFor(old.autonomousLimitOverrideUsdCents);
      changes.push({
        label: 'Excepción al límite por pago',
        from: old.autonomousLimitOverrideUsdCents
          ? formatUsd(old.autonomousLimitOverrideUsdCents)
          : null,
        to: formatUsd(next.autonomousLimitOverrideUsdCents!),
      });
    }
    if (next.validUntil !== null && next.validUntil < validUntil) {
      next.validUntil = validUntil;
    }
    terms = next;
  }

  if (terms.autonomousLimitOverrideUsdCents && kind !== 'update_mandate') {
    changes.push({
      label: 'Excepción al límite por pago',
      from: null,
      to: formatUsd(terms.autonomousLimitOverrideUsdCents),
    });
  }

  const exposure =
    toUsdCentsCeil(terms.periodCapMinor, terms.currency, policy.fx) ??
    convertMinorCeil(terms.periodCapMinor, terms.currency, 'USD', policy.fx) ??
    0;
  const amount = formatMoney(f.amountMinor, currency);
  const titles: Record<ProposalKind, string> = {
    register_payee_and_mandate: `Registrar a ${payeeName} y firmar un acuerdo`,
    create_mandate: `Firmar un acuerdo con ${payeeName}`,
    update_mandate: `Actualizar el acuerdo con ${payeeName}`,
  };
  const rationale =
    `${approvedBy} aprobó pagarle ${amount} a ${payeeName} el ${formatDate(input.approvedAt.slice(0, 10))}. ` +
    `Si este cobro se repite, con este acuerdo el agente lo pagará solo, con una exposición máxima de ${formatUsd(exposure)} al mes ` +
    `(${plural(terms.maxInvoicesPerPeriod, 'factura')} al mes, válido hasta el ${formatDate(terms.validUntil ?? validUntil)}).`;

  return {
    kind,
    payeeId: f.payeeId,
    newPayee,
    baseMandate,
    terms,
    changes,
    fixesRules: [...failing],
    exposureUsdCentsPerMonth: exposure,
    title: titles[kind],
    rationale,
    warnings,
  };
}

/** A past escalation, summarised for impact simulation. */
export interface PastEscalation {
  issuerTaxIdNorm: string | null;
  payeeId: string | null;
  destinationNorm: string | null;
  failingRules: RuleId[];
  currency: string | null;
  amountMinor: number | null;
}

/** How many past escalations of this payee the proposal would have resolved automatically. */
export function proposalImpact(
  draft: MandateProposalDraft,
  past: PastEscalation[],
  identity: { payeeId: string | null; taxIdNorm: string | null; destinationNorm: string | null },
): number {
  const max =
    draft.terms.amount.kind === 'fixed'
      ? toleranceBounds(draft.terms.amount.amountMinor, draft.terms.amount.tolerancePct)
      : { min: 0, max: draft.terms.amount.maxMinor };
  return past.filter((e) => {
    const same =
      (identity.payeeId && e.payeeId === identity.payeeId) ||
      (identity.taxIdNorm && e.issuerTaxIdNorm === identity.taxIdNorm) ||
      (identity.destinationNorm && e.destinationNorm === identity.destinationNorm);
    if (!same || e.currency !== draft.terms.currency || e.amountMinor === null) return false;
    if (e.amountMinor < max.min || e.amountMinor > max.max) return false;
    return e.failingRules.length > 0 && e.failingRules.every((r) => TEACHABLE_RULES.has(r));
  }).length;
}

export interface MaterializedProposal {
  payee: Payee | null;
  mandate: Mandate;
  /** Previous mandate version this one replaces, if any. */
  supersedes: string | null;
}

/**
 * Turns an accepted proposal into the payee and mandate records it creates. Pure: ids, signer
 * and time are supplied by the caller (the API, inside the signing transaction).
 */
export function materializeProposal(
  draft: MandateProposalDraft,
  options: {
    payeeId: string;
    mandateId: string;
    mandateKey: string;
    signer: { userId: string; name: string };
    now: string;
  },
): MaterializedProposal {
  const signedBy = [{ userId: options.signer.userId, name: options.signer.name, at: options.now }];
  if (draft.kind === 'register_payee_and_mandate') {
    if (!draft.newPayee) throw new Error('register proposal without payee draft');
    const payee: Payee = { id: options.payeeId, ...draft.newPayee, status: 'active' };
    return {
      payee,
      mandate: {
        id: options.mandateId,
        key: options.mandateKey,
        version: 1,
        payeeId: payee.id,
        status: 'active',
        terms: draft.terms,
        signedBy,
        source: 'proposal',
        signedAt: options.now,
      },
      supersedes: null,
    };
  }
  if (!draft.payeeId) throw new Error('proposal without payee');
  const base = draft.kind === 'update_mandate' ? draft.baseMandate : null;
  return {
    payee: null,
    mandate: {
      id: options.mandateId,
      key: base?.key ?? options.mandateKey,
      version: (base?.version ?? 0) + 1,
      payeeId: draft.payeeId,
      status: 'active',
      terms: draft.terms,
      signedBy,
      source: 'proposal',
      signedAt: options.now,
    },
    supersedes: base?.id ?? null,
  };
}
