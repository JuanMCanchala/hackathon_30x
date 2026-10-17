# ADR-0012: Next.js App Router web with a Spanish UI behind an API proxy

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The users (a finance team paying contractors in Latin America) and the jury read Spanish. The
browser should talk to one origin, so CORS stays simple and the API's address is not exposed to
the client.

## Decision

`apps/web` is Next.js 16 (App Router) with Tailwind 4. All product copy is Spanish with correct
accents; code, docs and commits are English. [`next.config.ts`](../../apps/web/next.config.ts)
rewrites `/api/*`, `/openapi.json` and `/docs` to `API_URL`, sets `nosniff`, `Referrer-Policy` and
`X-Frame-Options`, and builds a standalone server for the container. The visual identity ("la
prueba": the proof bar and the receiving stamp) is in [DESIGN.md](../DESIGN.md).

## Consequences

- One origin in the browser; the API allows CORS only for `PUBLIC_WEB_URL`.
- `API_URL` is resolved at build time, so the web is built per environment.
