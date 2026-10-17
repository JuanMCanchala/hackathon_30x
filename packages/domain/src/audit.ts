/**
 * Independent auditor (ADR-0006).
 *
 * It replays the ledger — never the database tables, never the engine — and re-checks every
 * payment against the invariants with deliberately separate, simpler code. If the engine had a
 * bug that let a payment through, this is where it shows up.
 */
import type { DecisionFacts, OrganizationProfile, Outcome, RuleId } from './types';
import {
  GENESIS_HASH,
  hashInput,
  type HashFn,
  type LedgerEntry,
  type LedgerEntryType,
} from './ledger';
import type { Mandate, Payee, PayoutMethod, PolicyTerms } from './schemas';

// ---------- payloads shared with the API that writes them ----------

export interface UserSnapshot {
  id: string;
  name: string;
  email: string;
  role: 'operator' | 'approver' | 'controller' | 'admin';
  canApprove: boolean;
  canSign: boolean;
}

export interface PaymentFacts {
  paymentId: string;
  invoiceId: string;
  ref: string;
  payeeId: string;
  rail: PayoutMethod;
  destination: string;
  currency: string;
  amountMinor: number;
}

export interface LedgerPayloads {
  ORG_SEEDED: { organization: OrganizationProfile; treasuryBalanceUsdCents: number };
  USER_REGISTERED: { user: UserSnapshot };
  POLICY_VERSION_CREATED: { version: number; terms: PolicyTerms; note: string | null };
  PAYEE_REGISTERED: { payee: Payee };
  PAYEE_UPDATED: { payee: Payee; changes: string[] };
  MANDATE_SIGNED: { mandate: Mandate; supersedes: string | null };
  MANDATE_REVOKED: { mandateId: string; reason: string | null };
  AGENT_REGISTERED: { agent: { id: string; name: string; scope: unknown } };
  INVOICE_RECEIVED: {
    invoiceId: string;
    ref: string;
    source: string;
    documentSha256: string | null;
    requestedBy: string;
  };
  INVOICE_EXTRACTED: {
    invoiceId: string;
    provider: string;
    model: string | null;
    cacheHit: boolean;
    ok: boolean;
    error: string | null;
  };
  DECISION_RECORDED: {
    invoiceId: string;
    ref: string;
    outcome: Outcome;
    approvalsRequired: number;
    policyVersion: number;
    facts: DecisionFacts;
    results: { id: RuleId; status: 'pass' | 'fail' | 'skip'; safeSkip: boolean; onFail: string }[];
    summary: string;
    counterfactual: string[];
    engineVersion: string;
  };
  APPROVAL_REQUESTED: { requestId: string; invoiceId: string; required: number };
  APPROVAL_GIVEN: {
    requestId: string;
    invoiceId: string;
    userId: string;
    via: 'web' | 'link';
    note: string | null;
  };
  APPROVAL_REJECTED: { requestId: string; invoiceId: string; userId: string; note: string | null };
  INVOICE_APPROVED: {
    invoiceId: string;
    requestId: string;
    usdCents: number | null;
    periodKey: string;
    approvers: string[];
  };
  INVOICE_REJECTED: { invoiceId: string; requestId: string; userId: string };
  PROPOSAL_CREATED: { proposalId: string; invoiceId: string; title: string };
  PROPOSAL_ACCEPTED: { proposalId: string; userId: string; mandateId: string; payeeId: string };
  PROPOSAL_REJECTED: { proposalId: string; userId: string; note: string | null };
  PAYMENT_SCHEDULED: PaymentFacts & { usdCents: number | null; scheduledFor: string };
  PAYMENT_SENT: PaymentFacts & { reference: string; expectedSettlement: string };
  PAYMENT_SETTLED: { paymentId: string; invoiceId: string; ref: string; reference: string };
  AUDIT_RUN: { ok: boolean; violations: number; decisionsChecked: number };
}

export type PayloadOf<T extends LedgerEntryType> = LedgerPayloads[T];

// ---------- report ----------

export type InvariantId = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'I9' | 'I10';

export const INVARIANTS: Record<InvariantId, string> = {
  I1: 'Pagos solo a beneficiarios habilitados y a su destino registrado',
  I2: 'Pagos solo dentro de un acuerdo firmado y vigente',
  I3: 'Pagos dentro del límite por pago (o de una excepción firmada)',
  I4: 'Pagos dentro del presupuesto del mes y del saldo',
  I5: 'Ninguna factura pagada dos veces',
  I6: 'Pagos solo con lectura confiable y sin instrucciones ocultas',
  I7: 'Aprobaciones humanas completas y de personas distintas',
  I8: 'Cadena del registro íntegra',
  I9: 'Cada decisión tiene su explicación',
  I10: 'Cada transferencia sale una vez, al destino registrado y por el monto decidido',
};

export interface AuditFinding {
  invariant: InvariantId;
  ref: string | null;
  message: string;
}

export interface AuditReport {
  ok: boolean;
  entries: number;
  chainIntact: boolean;
  brokenAtSeq: number | null;
  decisionsChecked: number;
  paymentsChecked: number;
  approvalsChecked: number;
  invariants: { id: InvariantId; title: string; checks: number; violations: number }[];
  findings: AuditFinding[];
}

// ---------- independent helpers (intentionally not shared with the engine) ----------

function auditKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key || null;
}

function auditDestination(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[^a-z0-9@]/g, '');
  return key || null;
}

/** USD cents, rounded up, from a decimal rate string ("units per USD"). Exponent 2 or 0. */
function auditUsdCents(amountMinor: number, currency: string, policy: PolicyTerms): number | null {
  if (currency === 'USD') return amountMinor;
  const rate = policy.fx.unitsPerUsd[currency];
  if (!rate) return null;
  const [whole, frac = ''] = rate.split('.');
  const micro = BigInt(whole + frac.padEnd(6, '0').slice(0, 6));
  if (micro === 0n) return null;
  const exponent = currency === 'CLP' ? 0n : 2n;
  // cents = amountMinor / 10^exp / (micro / 1e6) × 100
  const numerator = BigInt(amountMinor) * 100n * 1_000_000n;
  const denominator = micro * 10n ** exponent;
  const q = numerator / denominator;
  return Number(numerator % denominator === 0n ? q : q + 1n);
}

function withinMandateAmount(mandate: Mandate, amountMinor: number): boolean {
  const a = mandate.terms.amount;
  if (a.kind === 'up_to') return amountMinor <= a.maxMinor;
  // amount × (1 − t) ≤ x ≤ amount × (1 + t), compared in hundredths of a percent
  const t = BigInt(Math.round(a.tolerancePct * 100));
  const x = BigInt(amountMinor) * 10000n;
  return x >= BigInt(a.amountMinor) * (10000n - t) && x <= BigInt(a.amountMinor) * (10000n + t);
}

interface InvoiceState {
  invoiceId: string;
  ref: string;
  status: 'PAID' | 'HELD' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RECEIVED';
  payeeId: string | null;
  number: string | null;
  amountMinor: number | null;
  currency: string | null;
  usdCents: number | null;
  periodKey: string | null;
}

const COUNTS_FOR_MANDATE = new Set(['PAID', 'APPROVED', 'PENDING_APPROVAL']);
const COMMITTED = new Set(['PAID', 'APPROVED']);

export function auditLedger(entries: readonly LedgerEntry[], hash: HashFn): AuditReport {
  const findings: AuditFinding[] = [];
  const checks: Record<InvariantId, number> = {
    I1: 0,
    I2: 0,
    I3: 0,
    I4: 0,
    I5: 0,
    I6: 0,
    I7: 0,
    I8: 0,
    I9: 0,
    I10: 0,
  };
  const flag = (invariant: InvariantId, ref: string | null, message: string) =>
    findings.push({ invariant, ref, message });

  // I8 — hash chain
  let chainIntact = true;
  let brokenAtSeq: number | null = null;
  let prev = GENESIS_HASH;
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  for (const entry of ordered) {
    checks.I8++;
    const expected = hash(hashInput(prev, entry));
    if (entry.prevHash !== prev || entry.hash !== expected) {
      chainIntact = false;
      brokenAtSeq = entry.seq;
      flag('I8', null, `La cadena se rompe en el asiento #${entry.seq} (${entry.type}).`);
      break;
    }
    prev = entry.hash;
  }

  // Replay
  let treasury = 0;
  const policies = new Map<number, PolicyTerms>();
  const payees = new Map<string, Payee>();
  const mandates = new Map<string, { mandate: Mandate; active: boolean }>();
  const users = new Map<string, UserSnapshot>();
  const invoices = new Map<string, InvoiceState>();
  const requests = new Map<
    string,
    { invoiceId: string; required: number; approvers: Set<string> }
  >();
  const transferred = new Set<string>();
  const proposalInvoice = new Map<string, string>();
  let decisionsChecked = 0;
  let paymentsChecked = 0;
  let approvalsChecked = 0;

  const committedIn = (period: string) =>
    [...invoices.values()]
      .filter((i) => i.periodKey === period && COMMITTED.has(i.status))
      .reduce((s, i) => s + (i.usdCents ?? 0), 0);
  const committedAll = () =>
    [...invoices.values()]
      .filter((i) => COMMITTED.has(i.status))
      .reduce((s, i) => s + (i.usdCents ?? 0), 0);

  for (const entry of ordered) {
    switch (entry.type) {
      case 'ORG_SEEDED': {
        treasury = (entry.payload as PayloadOf<'ORG_SEEDED'>).treasuryBalanceUsdCents;
        break;
      }
      case 'USER_REGISTERED': {
        const { user } = entry.payload as PayloadOf<'USER_REGISTERED'>;
        users.set(user.id, user);
        break;
      }
      case 'POLICY_VERSION_CREATED': {
        const p = entry.payload as PayloadOf<'POLICY_VERSION_CREATED'>;
        policies.set(p.version, p.terms);
        break;
      }
      case 'PAYEE_REGISTERED':
      case 'PAYEE_UPDATED': {
        const { payee } = entry.payload as PayloadOf<'PAYEE_REGISTERED'>;
        payees.set(payee.id, payee);
        break;
      }
      case 'MANDATE_SIGNED': {
        const { mandate, supersedes } = entry.payload as PayloadOf<'MANDATE_SIGNED'>;
        if (supersedes) {
          const old = mandates.get(supersedes);
          if (old) old.active = false;
        }
        mandates.set(mandate.id, { mandate, active: true });
        break;
      }
      case 'MANDATE_REVOKED': {
        const { mandateId } = entry.payload as PayloadOf<'MANDATE_REVOKED'>;
        const m = mandates.get(mandateId);
        if (m) m.active = false;
        break;
      }
      case 'INVOICE_RECEIVED': {
        const p = entry.payload as PayloadOf<'INVOICE_RECEIVED'>;
        invoices.set(p.invoiceId, {
          invoiceId: p.invoiceId,
          ref: p.ref,
          status: 'RECEIVED',
          payeeId: null,
          number: null,
          amountMinor: null,
          currency: null,
          usdCents: null,
          periodKey: null,
        });
        break;
      }
      case 'DECISION_RECORDED': {
        const p = entry.payload as PayloadOf<'DECISION_RECORDED'>;
        const f = p.facts;
        decisionsChecked++;
        checks.I9++;
        if (!p.summary || p.results.length === 0) {
          flag('I9', p.ref, `La decisión de ${p.ref} no tiene explicación.`);
        }
        if (p.outcome === 'PAY') {
          paymentsChecked++;
          checkPayment(p, f);
        }
        const state = invoices.get(p.invoiceId);
        if (state) {
          state.status =
            p.outcome === 'PAY' ? 'PAID' : p.outcome === 'HOLD' ? 'HELD' : 'PENDING_APPROVAL';
          state.payeeId = f.payeeId;
          state.number = auditKey(f.invoiceNumber);
          state.amountMinor = f.amountMinor;
          state.currency = f.currency;
          state.usdCents = f.usdCents;
          state.periodKey = f.periodKey;
        }
        break;
      }
      case 'APPROVAL_REQUESTED': {
        const p = entry.payload as PayloadOf<'APPROVAL_REQUESTED'>;
        requests.set(p.requestId, {
          invoiceId: p.invoiceId,
          required: p.required,
          approvers: new Set(),
        });
        break;
      }
      case 'APPROVAL_GIVEN': {
        const p = entry.payload as PayloadOf<'APPROVAL_GIVEN'>;
        const user = users.get(p.userId);
        if (user?.canApprove) requests.get(p.requestId)?.approvers.add(p.userId);
        break;
      }
      case 'INVOICE_APPROVED': {
        const p = entry.payload as PayloadOf<'INVOICE_APPROVED'>;
        approvalsChecked++;
        checks.I7++;
        const request = requests.get(p.requestId);
        const state = invoices.get(p.invoiceId);
        if (!request) {
          flag('I7', state?.ref ?? null, 'Aprobada sin una solicitud de aprobación registrada.');
        } else if (request.approvers.size < request.required) {
          flag(
            'I7',
            state?.ref ?? null,
            `Aprobada con ${request.approvers.size} de ${request.required} aprobaciones válidas.`,
          );
        }
        if (state) state.status = 'APPROVED';
        break;
      }
      case 'PAYMENT_SENT': {
        // I10 — money leaves only for a decided bill, once, to the registered destination.
        const p = entry.payload as PayloadOf<'PAYMENT_SENT'>;
        checks.I10++;
        const state = invoices.get(p.invoiceId);
        const payee = payees.get(p.payeeId);
        if (!state || !COMMITTED.has(state.status)) {
          flag('I10', p.ref, 'Transferencia de una factura que no estaba pagada ni aprobada.');
        } else {
          if (state.payeeId !== p.payeeId)
            flag('I10', p.ref, 'La transferencia va a otro beneficiario que el de la decisión.');
          if (state.amountMinor !== p.amountMinor || state.currency !== p.currency)
            flag('I10', p.ref, 'La transferencia no es por el monto decidido.');
        }
        if (!payee || payee.status !== 'active') {
          flag('I10', p.ref, 'Transferencia a un beneficiario no habilitado.');
        } else if (auditDestination(payee.destination.value) !== auditDestination(p.destination)) {
          flag('I10', p.ref, 'La transferencia salió a un destino distinto del registrado.');
        }
        if (transferred.has(p.invoiceId)) {
          flag('I10', p.ref, 'La factura se transfirió dos veces.');
        }
        transferred.add(p.invoiceId);
        break;
      }
      case 'PROPOSAL_CREATED': {
        const p = entry.payload as PayloadOf<'PROPOSAL_CREATED'>;
        proposalInvoice.set(p.proposalId, p.invoiceId);
        break;
      }
      case 'PROPOSAL_ACCEPTED': {
        // A signed registration makes a bill from someone unknown that payee's bill. It never
        // moves a bill that already belonged to a payee.
        const p = entry.payload as PayloadOf<'PROPOSAL_ACCEPTED'>;
        const state = invoices.get(proposalInvoice.get(p.proposalId) ?? '');
        if (state && state.payeeId === null) state.payeeId = p.payeeId;
        break;
      }
      case 'INVOICE_REJECTED': {
        const p = entry.payload as PayloadOf<'INVOICE_REJECTED'>;
        const state = invoices.get(p.invoiceId);
        if (state) state.status = 'REJECTED';
        break;
      }
      default:
        break;
    }
  }

  function checkPayment(p: PayloadOf<'DECISION_RECORDED'>, f: DecisionFacts) {
    const ref = p.ref;
    const policy = policies.get(p.policyVersion);

    // I1 — registered, active payee; registered destination
    checks.I1++;
    const payee = f.payeeId ? payees.get(f.payeeId) : undefined;
    if (!payee) {
      flag('I1', ref, 'Pagada a un beneficiario que no estaba registrado.');
    } else {
      if (payee.status !== 'active')
        flag('I1', ref, `Pagada a ${payee.name}, que estaba bloqueado.`);
      const registered = auditDestination(payee.destination.value);
      const onInvoice = auditDestination(f.invoiceDestination);
      if (onInvoice && onInvoice !== registered) {
        flag('I1', ref, 'Pagada con datos de pago distintos de los registrados.');
      }
      if (auditDestination(f.destination?.value) !== registered) {
        flag('I1', ref, 'El destino usado no es el registrado para el beneficiario.');
      }
    }

    // I2 — inside an active, valid mandate
    checks.I2++;
    const m = f.mandateId ? mandates.get(f.mandateId) : undefined;
    if (!m || !m.active) {
      flag('I2', ref, 'Pagada sin un acuerdo firmado activo.');
    } else {
      const t = m.mandate.terms;
      if (m.mandate.payeeId !== f.payeeId)
        flag('I2', ref, 'El acuerdo usado es de otro beneficiario.');
      if (f.decisionDate < t.validFrom || (t.validUntil && f.decisionDate > t.validUntil)) {
        flag('I2', ref, 'El acuerdo no estaba vigente en la fecha de la decisión.');
      }
      if (f.currency !== t.currency) flag('I2', ref, 'Moneda distinta a la del acuerdo.');
      if (f.amountMinor === null || !withinMandateAmount(m.mandate, f.amountMinor)) {
        flag('I2', ref, 'Monto fuera de lo acordado.');
      }
      const sameMonth = [...invoices.values()].filter(
        (i) =>
          i.invoiceId !== p.invoiceId &&
          i.payeeId === f.payeeId &&
          i.periodKey === f.periodKey &&
          COUNTS_FOR_MANDATE.has(i.status),
      );
      if (sameMonth.length + 1 > t.maxInvoicesPerPeriod) {
        flag('I2', ref, `Supera las ${t.maxInvoicesPerPeriod} facturas por mes del acuerdo.`);
      }
      const monthTotal = sameMonth
        .filter((i) => i.currency === t.currency)
        .reduce((s, i) => s + (i.amountMinor ?? 0), 0);
      if (f.amountMinor !== null && monthTotal + f.amountMinor > t.periodCapMinor) {
        flag('I2', ref, 'Supera el tope mensual del acuerdo.');
      }
    }

    // I3 — per-payment limit (recomputed)
    checks.I3++;
    const usd =
      policy && f.amountMinor !== null && f.currency
        ? auditUsdCents(f.amountMinor, f.currency, policy)
        : null;
    if (!policy || usd === null) {
      flag('I3', ref, 'No se pudo recalcular el monto en USD con la política registrada.');
    } else {
      const override = m?.mandate.terms.autonomousLimitOverrideUsdCents ?? 0;
      if (usd > Math.max(policy.autonomousLimitUsdCents, override)) {
        flag('I3', ref, 'Supera el límite por pago sin excepción firmada.');
      }
    }

    // I4 — budget and balance
    checks.I4++;
    if (policy && usd !== null) {
      if (committedIn(f.periodKey) + usd > policy.monthlyBudgetUsdCents) {
        flag('I4', ref, 'Supera el presupuesto del mes.');
      }
      if (committedAll() + usd > treasury) flag('I4', ref, 'Supera el saldo de la cuenta.');
    }

    // I5 — no double payment of the same number
    checks.I5++;
    const number = auditKey(f.invoiceNumber);
    const twin = [...invoices.values()].find(
      (i) =>
        i.invoiceId !== p.invoiceId &&
        i.payeeId === f.payeeId &&
        number !== null &&
        i.number === number &&
        COUNTS_FOR_MANDATE.has(i.status),
    );
    if (!number) flag('I5', ref, 'Pagada sin número de factura.');
    else if (twin)
      flag('I5', ref, `Mismo número que ${twin.ref}, que ya estaba pagada o en curso.`);

    // I6 — reliable reading, no injected instructions
    checks.I6++;
    if (policy && (f.minConfidence === null || f.minConfidence < policy.minExtractionConfidence)) {
      flag('I6', ref, 'Pagada con una lectura de baja confianza.');
    }
    if (f.agentInstructionsDetected)
      flag('I6', ref, 'Pagada pese a traer instrucciones para el agente.');
  }

  const invariants = (Object.keys(INVARIANTS) as InvariantId[]).map((id) => ({
    id,
    title: INVARIANTS[id],
    checks: checks[id],
    violations: findings.filter((f) => f.invariant === id).length,
  }));

  return {
    ok: findings.length === 0,
    entries: ordered.length,
    chainIntact,
    brokenAtSeq,
    decisionsChecked,
    paymentsChecked,
    approvalsChecked,
    invariants,
    findings,
  };
}
