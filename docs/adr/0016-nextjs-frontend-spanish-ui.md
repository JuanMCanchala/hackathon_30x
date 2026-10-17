# ADR-0016: Next.js App Router frontend with a Spanish UI behind an API proxy

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The deliverable includes "a simple screen where the company defines its rules and sees what the
agent paid, held, left pending and why". Judges and users are Spanish speakers in Latin America;
the code and docs are in English for a wider audience.

## Decision

- `apps/web` is a Next.js App Router application with Tailwind CSS and accessible primitives.
- The browser only talks to the web origin; Next.js rewrites `/api/*` to the API service. No CORS,
  one public URL.
- Client data fetching uses SWR keyed by API path; the SSE stream revalidates keys.
- All user-facing copy is Spanish; amounts are rendered with ISO currency codes
  (`USD 3.500,00`, `COP 14.000.000`) to avoid the ambiguous `$`.
- Demo identity is a user switcher (Laura, Martín, Sofía) sent as a header; real authentication
  is out of scope and documented as such.

## Consequences

- One deployable URL for the jury; the API stays independently deployable for agents and MCP.
- Shared types come from `packages/domain`, so the UI cannot drift from the engine's contracts.
