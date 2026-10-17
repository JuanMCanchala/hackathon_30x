# ADR-0009: PostgreSQL with Drizzle; PGlite for zero-infrastructure runs and tests

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

We need transactions, row locks, JSONB and reliable migrations. We also need the jury (and CI) to
run the whole system with `pnpm install && pnpm dev`, without Docker or a database server.

## Decision

- **PostgreSQL** is the system of record. Schema and migrations are managed with **Drizzle ORM /
  drizzle-kit** (SQL-first, typed queries, no code generation step at runtime).
- When `DATABASE_URL` is set, the API uses `node-postgres`. When it is not, it uses **PGlite**
  (PostgreSQL compiled to WebAssembly) persisted under `.data/`. Tests use in-memory PGlite.
- The same migrations run on both drivers.

## Consequences

- Tests run against real PostgreSQL semantics (locks, constraints, JSONB) in milliseconds, with no
  mocks for repositories.
- Local runs need no infrastructure; production runs on managed Postgres (Railway).
- PGlite is single-connection, which is fine for local use; production concurrency is handled by
  [ADR-0011](0011-serialized-decisions-per-organization.md).
