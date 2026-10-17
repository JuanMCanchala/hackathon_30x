# ADR-0004: Mandates — humans sign agreements, the agent only proposes

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

A global policy alone (limits, budgets, allowlist) cannot tell whether a bill matches _what was
agreed_ with that payee, and it forces a binary trade-off: low limits (safe, little autonomy) or
high limits (autonomy, large exposure). The challenge scores autonomy and safety at the same time.

## Decision

Introduce the **mandate**: a standing, human-signed agreement per payee that bounds autonomous
payment.

```
Mandate {
  payee, currency,
  amount: fixed ± tolerance% | up to a maximum,
  periodCap (per calendar month), maxInvoicesPerPeriod,
  autonomousLimitOverride? (signed exception above the global per-payment limit),
  validFrom, validUntil, signedBy[], version
}
```

- `PAY` requires an active mandate that covers the bill (currency, amount, period cap, frequency,
  validity) **and** the global policy.
- Mandates are versioned and immutable; changes create a new version. Decisions record the
  mandate version they relied on.
- When a person approves an escalated bill whose failure is _teachable_ (new payee, no mandate,
  amount changed, over the global limit, period cap), the agent creates a **proposal**: a draft
  mandate change with its rationale, the maximum monthly exposure it adds and its replayed impact
  on history.
- A proposal only takes effect when a user with signing rights **accepts** it. The agent has no
  write path to policies or mandates.
- Some changes are never proposed: payout destination changes (the classic attack vector),
  unblocking payees, budget increases and currency changes.

## Consequences

- Autonomy grows month over month (the _trust ladder_) while each autonomous payment stays inside
  something a person signed.
- Every increase of autonomy has a bounded, displayed cost: "maximum exposure USD X per month".
- Humans can reject proposals; the product shows that rejection as a normal path, not a failure.
