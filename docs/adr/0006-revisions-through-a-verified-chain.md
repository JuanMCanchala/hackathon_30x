# ADR-0006: Corrected bills chain only through the portal token; the case carries what it paid

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

After a partial payment or an ask, the vendor sends a corrected bill. Treated as a new bill, its
already-paid part is paid twice, or the duplicate check holds it. If any bill could claim to
correct another ("this replaces FV-0012"), a forged bill could attach itself to a case that
already paid.

## Decision

- A bill supersedes another only when it arrives through the portal token bound to that case. The
  HTTP upload route never takes `supersedesBillId` from input, and the reading's `revisionOf` never
  creates a chain. A correction from another vendor is refused.
- The new bill inherits the case: `chain` (itself and every bill it supersedes), `askedAt` and
  `casePaidMinor`. The engine pays only what is evidenced minus what the chain already paid, and
  `terms.cap` counts the case's payment once
  ([`bills.ts`](../../apps/api/src/services/bills.ts)).
- A correction to a closed case (paid, held, approved, rejected) is refused with 409, re-checked
  inside the lock in case a person closed it while the document was being read.
- A returned payment keeps the bill `PAID`; reconciliation flags the returned bank line.

## Consequences

- Daniela's corrected bill for 92 h closes her case without a second payment (`oct-03-r1`).
- The checker's I3 bounds every payment by its own bill and by everything paid on its chain.
- A vendor can only correct a case it was asked about.
