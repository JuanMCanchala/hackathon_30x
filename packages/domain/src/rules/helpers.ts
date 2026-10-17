import type { Derived } from '../derive';
import type { RuleId, RuleResult, RuleStage } from '../types';

export interface RuleMeta {
  id: RuleId;
  stage: RuleStage;
  title: string;
  onFail: 'HOLD' | 'ESCALATE';
  teachable: boolean;
}

export interface RuleDefinition {
  meta: RuleMeta;
  evaluate: (d: Derived) => RuleResult;
}

export function defineRule(
  meta: RuleMeta,
  evaluate: (d: Derived, meta: RuleMeta) => RuleResult,
): RuleDefinition {
  return { meta, evaluate: (d) => evaluate(d, meta) };
}

interface Evidence {
  observed?: string | null;
  expected?: string | null;
}

function base(meta: RuleMeta) {
  return {
    id: meta.id,
    stage: meta.stage,
    title: meta.title,
    onFail: meta.onFail,
    teachable: meta.teachable,
  };
}

export function pass(meta: RuleMeta, detail: string, evidence: Evidence = {}): RuleResult {
  return {
    ...base(meta),
    status: 'pass',
    safeSkip: false,
    observed: evidence.observed ?? null,
    expected: evidence.expected ?? null,
    detail,
    remedy: null,
  };
}

export function fail(
  meta: RuleMeta,
  detail: string,
  remedy: string,
  evidence: Evidence = {},
): RuleResult {
  return {
    ...base(meta),
    status: 'fail',
    safeSkip: false,
    observed: evidence.observed ?? null,
    expected: evidence.expected ?? null,
    detail,
    remedy,
  };
}

/**
 * A rule that cannot be evaluated. `safe` skips are reserved for rules that know they do not
 * apply (no line items, no amount in words…); anything else blocks PAY (ADR-0003).
 */
export function skip(meta: RuleMeta, detail: string, safe: boolean): RuleResult {
  return {
    ...base(meta),
    status: 'skip',
    safeSkip: safe,
    observed: null,
    expected: null,
    detail,
    remedy: safe ? null : `se pudiera verificar «${meta.title.toLowerCase()}»`,
  };
}

export const CATEGORY_LABELS: Record<string, string> = {
  contractor: 'contratistas',
  software: 'software',
  services: 'servicios',
  facilities: 'oficinas e instalaciones',
  travel: 'viajes',
  other: 'otros gastos',
};

export function payeeLabel(d: Derived): string {
  return d.payee?.name ?? d.x?.issuer.name ?? 'quien cobra';
}
