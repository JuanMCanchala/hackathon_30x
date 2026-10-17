# ADR-0010: Business time is a simulated clock stored in the database

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The demo lives through two months in three minutes: vendor deadlines expire, payments execute on
their due dates, the October statement arrives on November 10. The eval must produce the same
dates on every run. Code that reads the wall clock would make both impossible.

## Decision

Business logic never reads `Date.now()`. The current time is `org_state.now`, read and moved by
the `Clock` service ([`clock.ts`](../../apps/api/src/services/clock.ts)), and the engine receives
`now` in its context. Script steps carry their own timestamps; `clock` steps move time, execute the
payments due and re-decide the open asks.

## Consequences

- The app's "Hoy en la demo" date is real state; the eval is deterministic.
- Median bill → payment hours and yield kept are measured in simulated time.
- A production deployment would put the wall clock behind the same interface.
