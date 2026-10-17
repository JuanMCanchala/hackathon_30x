# ADR-0011: Serialize state-changing operations per organization

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Two bills decided concurrently can each see the same remaining budget and both be paid, exceeding
it. The ledger's hash chain also needs a single, linear order of appends.

## Decision

Every state-changing use case (decide, approve, reject, sign or revoke a mandate, accept a
proposal, change policy) runs inside a database transaction that first takes
`SELECT … FROM organizations WHERE id = $1 FOR UPDATE`. Inside the lock it reads the period spend,
decides, reserves budget and appends ledger entries.

## Consequences

- No double-spend of budget, no forked hash chain. A test fires concurrent decisions and asserts
  the budget is never exceeded.
- Throughput per organization is serialized. At dozens of bills a month (even thousands a day) the
  critical section is milliseconds; extraction (the slow part) happens **outside** the lock.
- Different organizations never contend.
