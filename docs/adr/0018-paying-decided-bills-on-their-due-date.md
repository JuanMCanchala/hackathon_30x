# ADR-0018: Paying decided bills on their due date, through a rail port

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Mandato decided whether to pay, but nothing left the account: the challenge is "agents that pay
for the company", and Blinka's business is moving dollars to Latin American rails. Paying is also
where a decision can still go wrong: a destination changed after approval, a payee blocked
before the money leaves, a transfer sent twice.

## Decision

- A bill the engine paid, or people approved, gets a **payment** in the same transaction as the
  decision: scheduled for its **due date** (never before the decision, never late; weekends move
  to Monday), for the decided amount, to the payee's **registered** destination. A bill approved
  for someone who is not registered gets no transfer until the payee is registered — approving
  never invents a destination.
- Running payments sends what is due and settles what has arrived. The destination is re-read
  from the registry **when the money leaves**, so a verified change of account applies and a
  blocked payee is not paid.
- Rails are pure data in the domain (`RAILS`): Bre-B, SPEI and Pix settle in seconds, ACH the next
  business day, international wires in two. The rail here is simulated; Blinka's API, Bre-B, SPEI
  or Pix would implement the same send/settle calls.
- Three ledger entries (`PAYMENT_SCHEDULED`, `PAYMENT_SENT`, `PAYMENT_SETTLED`) and a tenth
  invariant for the independent auditor: **I10 — every transfer leaves once, for a bill that was
  paid or approved, to the destination registered at that moment, for the decided amount.**
- In the guided months, transfers go out on their due dates as the timeline advances; "Ejecutar
  pagos de hoy" runs them with the real clock.

## Consequences

- The auditor caught the first bug of this feature before it shipped: a transfer scheduled before
  Valentina's verified change of key would have gone to the old one.
- Cash stays in the company until bills are due; the payments screen shows the balance after
  everything scheduled.
- Real money needs a real rail adapter, idempotency keys on its side, and reconciliation of
  settlement webhooks; the port and the ledger entries are where they plug in.
