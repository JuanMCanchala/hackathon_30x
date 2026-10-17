# ADR-0006: Append-only hash-chained ledger and an independent auditor

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

"Zero payments outside the rules" is a claim the judges must be able to verify, and finance teams
must reconcile what was paid and why. If the same code that decides also checks itself, a bug in
the engine is invisible.

## Decision

1. **Ledger.** Every state change (bill received, extracted, decided, approval requested, approved,
   rejected, mandate signed or revoked, proposal created or resolved, policy changed, audit run) is
   an append-only entry. Each entry stores `prevHash` and `hash = SHA-256(prevHash ‖ canonical JSON
of the entry)`, forming a chain per organization. Tampering with any entry breaks every later
   hash.
2. **Auditor.** A module that re-derives the facts from stored records and checks invariants with
   code written independently of the engine (N-version style):
   - every agent `PAY` targets a registered, active payee and its registered destination;
   - an active mandate version covered the payee, currency, amount, frequency and period cap;
   - the global per-payment limit (or a signed exception) and the period budget were respected;
   - no invoice number was paid twice for the same payee;
   - every human-approved bill has the required number of distinct approvers;
   - the hash chain is intact.
3. The auditor runs on demand from the UI, after each demo step and in CI over the dataset.

## Consequences

- The safety claim is backed by a second implementation, not by the engine's word.
- Exports (CSV/JSON) come from the ledger, so reconciliation matches decisions exactly.
- The ledger grows without updates or deletes; demo resets drop the organization's data
  explicitly and are themselves out of band (development only).
