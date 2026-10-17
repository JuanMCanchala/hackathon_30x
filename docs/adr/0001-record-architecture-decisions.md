# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Recibido was built in one night by a team of agents under review, against a deadline, and is read
by a jury that has minutes. Decisions that live only in commit messages or chat are lost, and a
reviewer cannot tell a deliberate trade-off from an accident.

## Decision

Record each significant decision as an ADR in `docs/adr`, numbered, in Nygard's format (context,
decision, consequences). A decision that changes later gets a new ADR that supersedes the old one.

## Consequences

- The jury and future maintainers can see why the system is shaped the way it is.
- Writing the consequences forces us to state the cost of each choice.
