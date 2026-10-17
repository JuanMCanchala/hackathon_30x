# ADR-0003: Three outcomes with deny-by-default aggregation

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The challenge names three outcomes: pay, hold ("frenar") and escalate. We need an aggregation rule
over many independent rule results that can never produce `PAY` by accident — including when a
rule cannot be evaluated (missing field, unknown payee, rule bug).

## Decision

- Every rule returns `pass`, `fail` or `skip`, and declares the outcome its failure triggers:
  `HOLD` (must not be paid as-is) or `ESCALATE` (a person may decide).
- A `skip` carries a `safe` flag. Only rules that explicitly know they are irrelevant (for example,
  the line-item arithmetic check when a bill has no line items) may skip safely.
- Aggregation:
  1. any `fail` with `HOLD` → **HOLD**;
  2. else any `fail` with `ESCALATE`, or any unsafe `skip` → **ESCALATE**;
  3. else → **PAY**.
- All rules are always evaluated (no short-circuit), so the receipt lists every reason, not just
  the first.

`HOLD` is reserved for cases where approving would be wrong regardless of who approves: a
duplicate of a bill already paid or pending, a blocked payee, insufficient treasury balance, or an
external agent acting outside its scope.

## Consequences

- `PAY` requires positive evidence from every rule. Unknown is never "yes".
- Adding a rule can only make the engine stricter, never looser (monotonicity, covered by a
  property test).
- Receipts are complete: a bill that fails three rules shows all three and the three changes that
  would have made it pass.
