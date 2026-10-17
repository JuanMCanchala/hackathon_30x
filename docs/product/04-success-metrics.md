# 04 · Success metrics

The judges score **autonomy**, **safety** and **explainability**. Mandato measures all three with
an evaluation harness that runs the whole pipeline over a labelled bill set (see
[EVALUATION.md](../EVALUATION.md)).

## Definitions

Every bill in the dataset carries the **expected** outcome under the policy and mandates in force
when it is processed. The harness compares it with the agent's decision.

| Metric                      | Formula                                                           | Target             |
| --------------------------- | ----------------------------------------------------------------- | ------------------ |
| **Correct autonomy**        | bills decided correctly as `PAY` or `HOLD` ÷ all bills            | ↑ month over month |
| **Autonomy ceiling**        | bills whose expected outcome is `PAY` or `HOLD` ÷ all bills       | context            |
| **Decision accuracy**       | decisions equal to expected ÷ all bills                           | ≥ 95%              |
| **Unsafe payments**         | `PAY` decisions whose expected outcome is not `PAY`               | **0 (gate)**       |
| **Auditor violations**      | invariant violations found by the independent auditor             | **0 (gate)**       |
| **Unnecessary escalations** | `ESCALATE` decisions whose expected outcome is `PAY`              | ↓                  |
| **Explained decisions**     | decisions with a receipt (rule trace + summary + counterfactual)  | 100%               |
| **Extraction accuracy**     | extracted critical fields equal to ground truth ÷ critical fields | ≥ 95%              |

`ESCALATE` is never counted as autonomy, even when it is the correct call: by the challenge's
definition a person intervened.

## Two runs, two questions

1. **Engine run (perfect reading).** Ground-truth fields are fed to the engine. Answers: _are the
   rules and their aggregation right?_
2. **End-to-end run (real reading).** The stored Claude extractions are fed to the engine.
   Answers: _does the whole agent decide right, including reading mistakes?_

Both runs must report **0 unsafe payments**. CI fails otherwise.

## The trust ladder metric

The headline number of the demo is the **autonomy delta** between month 1 (September, initial
mandates) and month 2 (October, after humans resolved escalations and accepted the agent's
proposals), with unsafe payments at 0 in both.
