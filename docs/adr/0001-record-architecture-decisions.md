# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Mandato is judged on whether anyone can understand _why_ it behaves as it does. The same applies
to its design: reviewers from Blinka and 30X need to see which trade-offs were made on purpose.

## Decision

We record every significant architectural decision as an ADR in `docs/adr/`, numbered
sequentially, using the Nygard template (Context, Decision, Consequences). ADRs are immutable once
accepted; a change of mind is a new ADR that supersedes the old one.

## Consequences

- Reviewers can trace any piece of the system back to the reason it exists.
- Writing an ADR forces us to name the alternative we rejected.
