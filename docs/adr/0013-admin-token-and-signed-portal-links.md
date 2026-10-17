# ADR-0013: An admin token outside demo mode and HMAC-signed portal links

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The demo must be clickable by anyone without a login. A deployment outside demo mode must not leave
money-moving routes (upload, approve, accept a deliverable, import hours) open. The vendor portal
must be reachable by a vendor with no account, but only for its own case.

## Decision

- `DEMO_MODE=true` (the default) mounts the demo routes and needs no credentials.
- `DEMO_MODE=false` requires `ADMIN_TOKEN` (at least 24 characters; the server refuses to start
  without it). Every non-GET route needs `Authorization: Bearer <token>`, compared timing-safe, and
  human actions are recorded as `ADMIN_ACTOR`. The two self-authenticated routes are the portal
  reply (its link token) and the GitHub webhook (its signature). Demo routes are not mounted
  ([`app.ts`](../../apps/api/src/http/app.ts), [`config.ts`](../../apps/api/src/config.ts)).
- Portal links are random tokens stored as SHA-256 hashes, or, for the demo inbox, stateless links
  `billId.HMAC(PORTAL_TOKEN_SECRET, billId)` valid only for a bill the agent has written to. Both
  resolve to the head of the case and must match its vendor.

## Consequences

- Safe enough for a pilot with one operator; a real deployment adds an identity provider.
- Portal tokens do not expire yet (a known limit).
