import { duplicateRules } from './duplicate';
import type { RuleDefinition } from './helpers';
import { mandateRules } from './mandate';
import { payeeRules } from './payee';
import { policyRules, requesterRules } from './policy';
import { readingRules } from './reading';

/** Every rule, in evaluation order. All of them run for every bill (ADR-0003). */
export const RULES: readonly RuleDefinition[] = [
  ...readingRules,
  ...payeeRules,
  ...duplicateRules,
  ...mandateRules,
  ...policyRules,
  ...requesterRules,
];

export const RULE_CATALOG = RULES.map((r) => r.meta);

export { describeMandate, describeMandateAmount } from './mandate';
export { CATEGORY_LABELS } from './helpers';
export type { RuleDefinition, RuleMeta } from './helpers';
