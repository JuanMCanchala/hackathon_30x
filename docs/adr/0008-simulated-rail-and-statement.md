# ADR-0008: The Blinka rail and its bank statement are simulated behind a port

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

No real money may move and Blinka's API is not public. Reconciliation still needs a statement with
the shapes a real one has: USD debits that differ slightly from the plan, transfer fees, a
returned payment and lines nothing explains.

## Decision

`PaymentRail.execute(payment, now)` returns the bank lines a payment produces
([`rail.ts`](../../apps/api/src/services/rail.ts)). `SimulatedBlinkaRail` is deterministic: the FX
drift (within ±0.6 %) is a hash of the payment id; fees follow the rail; the one payment the
dataset names (`oct-12-r1`, over Pix) is returned two days later; one card charge on the October
statement matches no payment. Rail and timing come from the pure `planPayment`
([`payments.ts`](../../packages/domain/src/payments.ts)): COP → Bre-B, MXN → SPEI, BRL → Pix,
USD → ACH; pay on the due date unless the early-payment discount is worth more than the yield of
keeping the money in a 4.0 % fund. Each assumption is written next to it, in Spanish.

## Consequences

- Reconciliation is exercised on realistic shapes and is reproducible
  ([`reconcile.ts`](../../packages/domain/src/reconcile.ts)).
- Plugging in Blinka's API is one adapter; the planner, the matcher and the views stay.
- Yield kept and fees saved are simulated figures, labeled as such wherever they appear.
