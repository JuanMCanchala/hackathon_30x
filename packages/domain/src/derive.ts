import { addDays, isValidIsoDate, localDate, periodKeyOf } from './dates';
import { currencyExponent, parseDecimalToMinor, toUsdCentsCeil } from './money';
import type { ExtractedInvoice, FxSnapshot, Mandate, Payee, PolicyTerms } from './schemas';
import {
  foldName,
  hasConfusableCharacters,
  nameSimilarity,
  normalizeDestination,
  normalizeInvoiceNumber,
  normalizeTaxId,
} from './text';
import type { DecisionContext, DecisionFacts, HistoryInvoice, PayeeMatch } from './types';

/** Statuses that commit (or may soon commit) money. */
const ACTIVE_STATUSES = new Set(['PAID', 'APPROVED', 'PENDING_APPROVAL']);
/** Statuses that count toward the month's committed budget. */
const COMMITTED_STATUSES = new Set(['PAID', 'APPROVED']);

/** Minimum name similarity to *suggest* (never resolve) a registered payee. */
const SIMILAR_NAME_THRESHOLD = 0.88;

export interface IssuerIdentity {
  payeeId: string | null;
  taxIdNorm: string | null;
  nameFolded: string | null;
  destinations: string[];
}

/** Everything the rules need, computed once per decision. */
export interface Derived {
  ctx: DecisionContext;
  x: ExtractedInvoice | null;
  terms: PolicyTerms;
  decisionDate: string;
  periodKey: string;
  currency: string | null;
  amountMinor: number | null;
  usdCents: number | null;
  invoiceNumberNorm: string | null;
  issueDate: string | null;
  dueDate: string | null;
  dueDateDefaulted: boolean;
  match: PayeeMatch;
  payee: Payee | null;
  mandate: Mandate | null;
  /** The payee's most recent active mandate when it exists but is outside its validity window. */
  mandateOutOfWindow: Mandate | null;
  identity: IssuerIdentity;
  invoiceDestinationNorm: string | null;
  /** Prior bills of the same issuer that are paid, approved or pending. */
  issuerActive: HistoryInvoice[];
  /** Same, restricted to the current budget period. */
  issuerMonth: HistoryInvoice[];
  /** Sum of `issuerMonth` amounts in the mandate currency (converted conservatively if needed). */
  issuerMonthAmountMinor: number;
  committedUsdCents: number;
  minConfidence: number | null;
  agentInstructionsDetected: boolean;
}

export function normalizedCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Converts between currencies through USD, rounding up at each step (conservative for caps). */
export function convertMinorCeil(
  amountMinor: number,
  from: string,
  to: string,
  fx: FxSnapshot,
): number | null {
  if (from === to) return amountMinor;
  const usd = toUsdCentsCeil(amountMinor, from, fx);
  if (usd === null) return null;
  if (to === 'USD') return usd;
  const rate = fx.unitsPerUsd[to];
  if (rate == null) return null;
  const [whole = '0', frac = ''] = rate.split('.');
  const numerator = BigInt(whole + frac);
  const scale = 10n ** BigInt(frac.length);
  // targetMinor = usdCents / 100 × (numerator / scale) × 10^exponent(to), rounded up
  const value = BigInt(usd) * numerator * 10n ** BigInt(currencyExponent(to));
  const denominator = 100n * scale;
  return Number((value + denominator - 1n) / denominator);
}

export function matchesIdentity(h: HistoryInvoice, id: IssuerIdentity): boolean {
  if (id.payeeId && h.payeeId === id.payeeId) return true;
  if (id.taxIdNorm && h.issuerTaxIdNorm === id.taxIdNorm) return true;
  if (h.destinationNorm && id.destinations.includes(h.destinationNorm)) return true;
  if (id.nameFolded && h.issuerNameFolded === id.nameFolded) return true;
  return false;
}

export function resolvePayee(x: ExtractedInvoice | null, payees: Payee[]): PayeeMatch {
  if (!x) return { status: 'unknown', similar: null };
  const taxId = normalizeTaxId(x.issuer.taxId);
  const destination = normalizeDestination(x.payout.destination);
  const byTaxId = taxId ? payees.find((p) => normalizeTaxId(p.taxId) === taxId) : undefined;
  const byDestination = destination
    ? payees.find((p) => normalizeDestination(p.destination.value) === destination)
    : undefined;
  if (byTaxId && byDestination && byTaxId.id !== byDestination.id) {
    return { status: 'conflict', byTaxId, byDestination };
  }
  if (byTaxId && byDestination) {
    return { status: 'matched', payee: byTaxId, by: 'tax_id_and_destination' };
  }
  if (byTaxId) return { status: 'matched', payee: byTaxId, by: 'tax_id' };
  if (byDestination) return { status: 'matched', payee: byDestination, by: 'destination' };

  const name = x.issuer.name ?? x.payout.accountHolder;
  if (!name) return { status: 'unknown', similar: null };
  let best: { payee: Payee; score: number } | null = null;
  for (const payee of payees) {
    const score = Math.max(nameSimilarity(name, payee.name), nameSimilarity(name, payee.legalName));
    if (!best || score > best.score) best = { payee, score };
  }
  return {
    status: 'unknown',
    similar:
      best && best.score >= SIMILAR_NAME_THRESHOLD
        ? { ...best, confusable: hasConfusableCharacters(name) }
        : null,
  };
}

export function selectMandate(
  payee: Payee | null,
  mandates: Mandate[],
  date: string,
): { mandate: Mandate | null; outOfWindow: Mandate | null } {
  if (!payee) return { mandate: null, outOfWindow: null };
  const active = mandates
    .filter((m) => m.payeeId === payee.id && m.status === 'active')
    .sort((a, b) => b.version - a.version);
  const inWindow = active.filter(
    (m) => m.terms.validFrom <= date && (m.terms.validUntil === null || date <= m.terms.validUntil),
  );
  return { mandate: inWindow[0] ?? null, outOfWindow: inWindow[0] ? null : (active[0] ?? null) };
}

function minimumConfidence(x: ExtractedInvoice): number | null {
  const c = x.confidence;
  const present: number[] = [c.currency, c.total];
  if (x.issuer.name || x.issuer.taxId) present.push(c.issuer);
  if (x.invoiceNumber) present.push(c.invoiceNumber);
  if (x.issueDate) present.push(c.issueDate);
  if (x.dueDate) present.push(c.dueDate);
  if (x.payout.destination) present.push(c.payout);
  return present.length ? Math.min(...present) : null;
}

export function derive(ctx: DecisionContext): Derived {
  const terms = ctx.policy.terms;
  const x = ctx.invoice.extraction;
  const tz = ctx.organization.timeZone;
  const decisionDate = localDate(ctx.now, tz);
  const periodKey = periodKeyOf(ctx.now, tz);

  const currency = normalizedCurrency(x?.currency);
  const amountMinor = currency ? parseDecimalToMinor(x?.total, currency) : null;
  const usdCents =
    currency && amountMinor !== null && amountMinor > 0
      ? toUsdCentsCeil(amountMinor, currency, terms.fx)
      : null;

  const rawIssueDate = x?.issueDate ?? null;
  const rawDueDate = x?.dueDate ?? null;
  const issueDate = isValidIsoDate(rawIssueDate) ? rawIssueDate : null;
  let dueDate: string | null = isValidIsoDate(rawDueDate) ? rawDueDate : null;
  let dueDateDefaulted = false;
  if (!dueDate && issueDate) {
    dueDate = addDays(issueDate, terms.defaultPaymentTermsDays);
    dueDateDefaulted = true;
  }

  const match = resolvePayee(x, ctx.payees);
  const payee = match.status === 'matched' ? match.payee : null;
  const { mandate, outOfWindow } = selectMandate(payee, ctx.mandates, decisionDate);

  const invoiceDestinationNorm = normalizeDestination(x?.payout.destination);
  const destinations = [
    invoiceDestinationNorm,
    payee ? normalizeDestination(payee.destination.value) : null,
  ].filter((d): d is string => d !== null);
  const issuerName = x?.issuer.name ?? null;
  const identity: IssuerIdentity = {
    payeeId: payee?.id ?? null,
    taxIdNorm: normalizeTaxId(x?.issuer.taxId) ?? normalizeTaxId(payee?.taxId),
    nameFolded: issuerName ? foldName(issuerName) || null : payee ? foldName(payee.name) : null,
    destinations,
  };

  const issuerActive = ctx.history.filter(
    (h) => ACTIVE_STATUSES.has(h.status) && matchesIdentity(h, identity),
  );
  const issuerMonth = issuerActive.filter((h) => h.periodKey === periodKey);
  const capCurrency = mandate?.terms.currency ?? currency;
  let issuerMonthAmountMinor = 0;
  if (capCurrency) {
    for (const h of issuerMonth) {
      if (h.amountMinor === null || !h.currency) continue;
      const converted = convertMinorCeil(h.amountMinor, h.currency, capCurrency, terms.fx);
      // An amount we cannot convert is counted as exceeding any cap (deny-by-default).
      issuerMonthAmountMinor += converted ?? Number.MAX_SAFE_INTEGER / 4;
    }
  }

  const committedUsdCents = ctx.history
    .filter((h) => h.periodKey === periodKey && COMMITTED_STATUSES.has(h.status))
    .reduce((sum, h) => sum + (h.usdCents ?? 0), 0);

  return {
    ctx,
    x,
    terms,
    decisionDate,
    periodKey,
    currency,
    amountMinor,
    usdCents,
    invoiceNumberNorm: normalizeInvoiceNumber(x?.invoiceNumber),
    issueDate,
    dueDate,
    dueDateDefaulted,
    match,
    payee,
    mandate,
    mandateOutOfWindow: outOfWindow,
    identity,
    invoiceDestinationNorm,
    issuerActive,
    issuerMonth,
    issuerMonthAmountMinor,
    committedUsdCents,
    minConfidence: x ? minimumConfidence(x) : null,
    agentInstructionsDetected:
      (x?.agentInstructions.detected ?? false) || ctx.invoice.instructionScan.matched,
  };
}

export function factsOf(d: Derived): DecisionFacts {
  return {
    periodKey: d.periodKey,
    decisionDate: d.decisionDate,
    amountMinor: d.amountMinor,
    currency: d.currency,
    usdCents: d.usdCents,
    invoiceNumber: d.x?.invoiceNumber ?? null,
    invoiceNumberNorm: d.invoiceNumberNorm,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    dueDateDefaulted: d.dueDateDefaulted,
    servicePeriod: d.x?.servicePeriod ?? null,
    issuerName: d.x?.issuer.name ?? null,
    issuerTaxIdNorm: d.identity.taxIdNorm,
    issuerNameFolded: d.identity.nameFolded,
    destinationNorm:
      d.invoiceDestinationNorm ??
      (d.payee ? normalizeDestination(d.payee.destination.value) : null),
    payeeMatch: d.match.status,
    payeeMatchedBy: d.match.status === 'matched' ? d.match.by : null,
    payeeId: d.payee?.id ?? null,
    payeeName: d.payee?.name ?? null,
    payeeCategory: d.payee?.category ?? null,
    destination: d.payee?.destination ?? null,
    invoiceDestination: d.x?.payout.destination ?? null,
    mandateId: d.mandate?.id ?? null,
    mandateKey: d.mandate?.key ?? null,
    mandateVersion: d.mandate?.version ?? null,
    minConfidence: d.minConfidence,
    agentInstructionsDetected: d.agentInstructionsDetected,
    committedUsdCentsBefore: d.committedUsdCents,
    monthlyBudgetUsdCents: d.terms.monthlyBudgetUsdCents,
    payeeMonthCountBefore: d.issuerMonth.length,
    payeeMonthAmountMinorBefore: d.issuerMonthAmountMinor,
    availableUsdCents: d.ctx.treasury.availableUsdCents,
  };
}
