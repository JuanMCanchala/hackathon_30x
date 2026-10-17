import { derive, factsOf, type Derived } from './derive';
import { formatMoney, formatPeriodMonth, formatUsd } from './format';
import { describeMandate, RULES } from './rules';
import type { Decision, DecisionContext, Outcome, RuleResult } from './types';

export const ENGINE_VERSION = '1.0.0';

/**
 * Deny-by-default aggregation (ADR-0003):
 * any HOLD failure → HOLD; else any ESCALATE failure or unsafe skip → ESCALATE; else PAY.
 */
export function aggregate(results: readonly RuleResult[]): Outcome {
  if (results.some((r) => r.status === 'fail' && r.onFail === 'HOLD')) return 'HOLD';
  if (results.some((r) => r.status === 'fail' || (r.status === 'skip' && !r.safeSkip))) {
    return 'ESCALATE';
  }
  return 'PAY';
}

function blocking(results: readonly RuleResult[]): RuleResult[] {
  return results.filter((r) => r.status === 'fail' || (r.status === 'skip' && !r.safeSkip));
}

function explain(
  outcome: Outcome,
  results: readonly RuleResult[],
  d: Derived,
): { summary: string; counterfactual: string[] } {
  if (outcome === 'PAY') {
    const amount =
      d.currency && d.amountMinor !== null ? formatMoney(d.amountMinor, d.currency) : 'el cobro';
    const usd =
      d.currency && d.currency !== 'USD' && d.usdCents !== null
        ? ` (≈ ${formatUsd(d.usdCents)})`
        : '';
    const mandate = d.mandate ? describeMandate(d.mandate.terms) : 'el acuerdo firmado';
    return {
      summary: `Pagada sola: ${d.payee?.name ?? 'el beneficiario'} cobra ${amount}${usd} y cumple el acuerdo firmado (${mandate}). Está dentro del límite por pago y del presupuesto de ${formatPeriodMonth(d.periodKey)}.`,
      counterfactual: [],
    };
  }

  const failing = blocking(results);
  const fails = failing.filter((r) => r.status === 'fail');
  const primary = outcome === 'HOLD' ? fails.filter((r) => r.onFail === 'HOLD') : fails;
  // Unsafe skips are usually a consequence of an upstream failure (no payee → no mandate to
  // check); they only lead the explanation when nothing failed outright.
  const reasons = fails.length > 0 ? fails : failing;
  const lead = primary[0] ?? reasons[0];
  const others = reasons.length - 1;
  const more = others > 0 ? ` Hay ${others} ${others === 1 ? 'motivo más' : 'motivos más'}.` : '';
  const prefix = outcome === 'HOLD' ? 'Frenada.' : 'Necesita aprobación.';
  const summary = lead ? `${prefix} ${lead.detail.replace(/\.$/, '')}.${more}` : prefix;

  const ordered = [...primary, ...reasons.filter((r) => !primary.includes(r))];
  const counterfactual = [
    ...new Set(ordered.map((r) => r.remedy).filter((r): r is string => Boolean(r))),
  ];
  return { summary, counterfactual };
}

/** The policy engine: a pure function from context to decision (ADR-0002). */
export function decide(ctx: DecisionContext): Decision {
  const d = derive(ctx);
  const results = RULES.map((rule) => rule.evaluate(d));
  const outcome = aggregate(results);
  const approvalsRequired: Decision['approvalsRequired'] =
    outcome !== 'ESCALATE'
      ? 0
      : d.usdCents === null || d.usdCents > d.terms.dualApprovalAboveUsdCents
        ? 2
        : 1;
  const { summary, counterfactual } = explain(outcome, results, d);
  return {
    outcome,
    results,
    summary,
    counterfactual,
    approvalsRequired,
    facts: factsOf(d),
    engineVersion: ENGINE_VERSION,
  };
}
