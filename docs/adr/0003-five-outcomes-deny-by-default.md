# ADR-0003: Five outcomes, aggregated deny by default

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

"Pay or ask a person" is not enough for services. A contractor who billed 160 h with 92 h logged
has earned 92 h; a bill without its period is a data problem the vendor fixes in a minute; a
re-sent bill must never reach a person as if it were new. Each of these deserves a different next
step, and the safe default must be obvious.

## Decision

Every check returns `pass`, `fail` or `not_run`, and declares what its failure means. The decision
is the most severe outcome among the failures, in this order:

`PAY` < `PAY_PART` < `ASK_VENDOR` < `ESCALATE` < `HOLD`

- `PAY` only when every check passes.
- `PAY_PART` comes only from `evidence.coverage`, when the contract allows partial payment and some
  evidence exists; with nothing left to pay now it becomes `ASK_VENDOR`.
- A check that could not run counts as `ESCALATE`; a failing check that later checks depend on
  turns them into `not_run`.
- `HOLD` (duplicates) is the most severe, so a duplicate never pays and never reaches a person as
  if it were a new bill.

## Consequences

- Adding a check can only make the agent more cautious.
- The receipt lists every check, so the reason and the counterfactual ("what would have to be true
  to pay it") come from the trace instead of being written by a model
  ([`explain.ts`](../../packages/domain/src/explain.ts)).
- Autonomy is bounded by the labels: some bills must reach a person (October's ceiling is 63.2 %).
