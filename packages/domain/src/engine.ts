import { activeContract, resolveVendor, runChecks } from './checks';
import type { Facts } from './checks';
import { evaluateLine } from './evidence';
import { counterfactual, summarize, vendorMessage } from './explain';
import { parseDecimalToMinor } from './money';
import type { BillStatus, Currency, Decision, DecisionContext, Outcome } from './types';

export { activeContract, resolveVendor } from './checks';
export { OUTCOME_LABEL, STATUS_LABEL } from './explain';

export const ENGINE_VERSION = 'recibido-engine-1';

const STATUS_FOR: Record<Outcome, BillStatus> = {
  PAY: 'PAID',
  PAY_PART: 'PART_PAID',
  ASK_VENDOR: 'AWAITING_VENDOR',
  ESCALATE: 'ESCALATED',
  HOLD: 'HELD',
};

export function statusForOutcome(o: Outcome): BillStatus {
  return STATUS_FOR[o];
}

/** Least to most severe. */
const SEVERITY: Outcome[] = ['PAY', 'PAY_PART', 'ASK_VENDOR', 'ESCALATE', 'HOLD'];
const CURRENCIES: Currency[] = ['USD', 'COP', 'MXN', 'BRL'];

const asCurrency = (s: string | null | undefined): Currency | null =>
  CURRENCIES.find((c) => c === s?.trim().toUpperCase()) ?? null;

/**
 * The only place a payment is decided. Pure: the same context always yields the same decision.
 * Deny by default — it pays only when every check passes.
 */
export function decide(ctx: DecisionContext): Decision {
  const reading = ctx.bill.reading;
  const vendor = reading ? resolveVendor(reading, ctx.vendors) : null;
  const contract =
    reading && vendor ? activeContract(vendor, ctx.contracts, reading.issueDate) : null;
  const billCurrency = asCurrency(reading?.currency);
  // every handled currency has 2 minor digits, so parsing never depends on this fallback
  const currency: Currency = contract?.currency ?? billCurrency ?? 'USD';
  const billedMinor = Math.max(0, parseDecimalToMinor(reading?.total, currency) ?? 0);

  const canEvaluate =
    reading !== null &&
    vendor !== null &&
    contract !== null &&
    billCurrency === contract.currency &&
    ctx.matches !== null &&
    ctx.matchError === null;
  const lines = canEvaluate
    ? reading.lines.map((line, i) => {
        const termId = ctx.matches!.find((m) => m.lineIndex === i)?.termId ?? null;
        const term = contract.terms.find((t) => t.id === termId) ?? null;
        return evaluateLine(line, i, term, reading, contract.currency, ctx.evidence, vendor.id);
      })
    : [];
  const evidencedMinor = Math.min(
    billedMinor,
    lines.reduce((s, l) => s + l.evidencedMinor, 0),
  );

  const facts: Facts = {
    ctx,
    reading,
    vendor,
    contract,
    currency,
    billedMinor,
    evidencedMinor,
    lines,
  };
  const checks = runChecks(facts);

  let outcome = checks.reduce<Outcome>((worst, c) => {
    if (c.status === 'pass') return worst;
    const o = c.status === 'not_run' ? 'ESCALATE' : c.onFail;
    return SEVERITY.indexOf(o) > SEVERITY.indexOf(worst) ? o : worst;
  }, 'PAY');

  const alreadyPaidMinor = ctx.case.paidMinor;
  let payNowMinor = 0;
  if (outcome === 'PAY') payNowMinor = Math.max(0, billedMinor - alreadyPaidMinor);
  if (outcome === 'PAY_PART') {
    payNowMinor = Math.max(0, evidencedMinor - alreadyPaidMinor);
    if (payNowMinor === 0) outcome = 'ASK_VENDOR';
  }
  const askMinor =
    outcome === 'PAY_PART' || outcome === 'ASK_VENDOR'
      ? Math.max(0, billedMinor - evidencedMinor)
      : 0;

  const decision: Decision = {
    outcome,
    vendorId: vendor?.id ?? null,
    contractId: contract?.id ?? null,
    currency: contract?.currency ?? billCurrency,
    billedMinor,
    evidencedMinor,
    alreadyPaidMinor,
    payNowMinor,
    askMinor,
    checks,
    lines,
    summary: '',
    counterfactual: counterfactual(checks),
    vendorMessage: null,
    engineVersion: ENGINE_VERSION,
  };
  decision.summary = summarize(decision, ctx);
  decision.vendorMessage = vendorMessage(decision, ctx);
  return decision;
}
