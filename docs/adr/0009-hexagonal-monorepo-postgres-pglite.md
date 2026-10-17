# ADR-0009: Hexagonal pnpm monorepo; PostgreSQL with Drizzle, PGlite without infrastructure

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The same engine must run in the API, in the eval, in property tests and in the web (labels and
formatting). The demo must start on a fresh clone with no database server, and a deployment must
use a real PostgreSQL. The team also maintains Mandato, built on the same stack.

## Decision

- pnpm workspace: `packages/domain` (pure: engine, evidence math, planner, reconciliation,
  checker), `packages/dataset` (Altamar Labs, documents, script, recordings), `apps/api` (Hono,
  services, adapters), `apps/web` (Next.js). The domain depends on none of the others.
- Drizzle over PostgreSQL when `DATABASE_URL` is set; otherwise PGlite (PostgreSQL compiled to
  WebAssembly) persisted under `DATA_DIR`, or in memory for tests and the eval
  ([`client.ts`](../../apps/api/src/db/client.ts)). Domain objects read whole (vendors, contracts,
  readings, decisions, evidence, payments) are JSONB next to the columns we filter on; every table
  carries `org_id` ([`schema.ts`](../../apps/api/src/db/schema.ts)).

## Consequences

- `pnpm install && pnpm dev` runs everything; `docker compose up` runs it on PostgreSQL.
- Tests and the eval run the same SQL as production.
- JSONB keeps the schema small; the cost is weaker relational constraints inside those documents.
