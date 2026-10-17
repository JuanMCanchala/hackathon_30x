# ADR-0008: Hexagonal architecture in a pnpm monorepo with a pure domain package

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The same decision logic must run in the HTTP API, the evaluation harness, the auditor's tests, the
MCP gateway and the frontend's what-if previews. It must be testable without a database, a network
or a model.

## Decision

A pnpm workspace with clear dependency direction:

```
packages/domain   ← pure TypeScript: types, Zod schemas, rules, engine, explanations,
                    proposals, auditor invariants, metrics. Depends on nothing but Zod.
packages/dataset  ← the fictitious company, bills, attacks and the scripted human actions.
apps/api          ← application services + adapters (Postgres, Claude, files, SSE, HTTP).
apps/web          ← Next.js UI (Spanish), talks to the API.
apps/mcp          ← MCP server for external agents, talks to the API.
```

Inside `apps/api`, application services depend on **ports** (`Extractor`, `DocumentStore`,
`Clock`, `EventBus`, repositories inside a unit of work); adapters implement them. The composition
root (`src/container.ts`) wires adapters from configuration.

## Consequences

- The engine is exercised by hundreds of fast unit and property tests.
- Swapping Postgres for PGlite, Claude for the replay cache, or the real clock for a simulated
  one is configuration, not code changes.
- Internal packages are consumed as TypeScript source (no build step); the API bundles them with
  esbuild for production.
