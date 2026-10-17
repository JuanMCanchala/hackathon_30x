# ADR-0015: Serialize every decision of an organization

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Monthly caps, duplicate checks and "what this case already paid" all depend on the payments of
earlier decisions. Two bills decided at the same moment could each see room under the cap and both
pay.

## Decision

Reading and line matching (slow model calls) run outside any lock. Writing the bill, deciding it
and creating its payment run inside `withOrgLock` and one database transaction
([`lock.ts`](../../apps/api/src/services/lock.ts)), so each decision sees the previous one's
payments. Anything that may have changed while a document was being read (a case closed by a
person, the same bytes arriving twice) is re-checked inside the lock.

## Consequences

- No race between decisions in one API process.
- The lock is in-process: more than one API instance needs `pg_advisory_xact_lock` (marked in the
  code).
