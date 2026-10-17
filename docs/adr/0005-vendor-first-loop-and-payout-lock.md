# ADR-0005: Ask the vendor before a person; the vendor can never change the payout

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Most AP escalations are data problems the vendor can fix: a missing period, a wrong rate, a total
that does not add up, hours not yet synced. Sending each one to a person costs the team time and
keeps autonomy low. But a channel where the vendor talks to the agent is also the classic fraud
channel: "we changed banks, pay to this account".

## Decision

- Checks whose failure the vendor can fix (`reading.arithmetic`, `reading.period`, `terms.lines`,
  `terms.price`, `evidence.coverage`) resolve to `ASK_VENDOR`. The engine writes a Spanish message
  with the exact gap and the remedy, and the vendor answers through a portal link bound to the
  bill ([`vendor-loop.ts`](../../apps/api/src/services/vendor-loop.ts)) with a message, a
  corrected bill, or both. Every answer and every new piece of evidence re-runs the engine.
- The contract sets the vendor's deadline (`vendorResponseDays`); past it, `vendor.deadline`
  escalates to a person.
- **Payout lock.** Money goes only to the destination in the vendor registry. A vendor's message
  reaches the engine as part of the bill's text, so `vendor.payout` escalates any other account or
  any payout-change wording, even with an otherwise correct corrected bill. The portal never shows
  or accepts payout details.

## Consequences

- In the eval, 9 of the 33 cases decided without a person closed through the vendor loop.
- A person sees only what the vendor could not resolve, or what no vendor may resolve.
- Changing a payout destination is a registry operation outside every agent path.
