# ADR-0014: Real-time updates with Server-Sent Events

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

When an approver taps "Aprobar" on a phone, the finance dashboard on the projector must update
immediately. Updates flow one way, from server to browser.

## Decision

The API publishes domain events (decision made, approval resolved, proposal created, audit run…)
on an in-process event bus and streams them at `GET /api/v1/events` as Server-Sent Events. The web
app subscribes once and revalidates the affected SWR cache keys.

## Consequences

- No WebSocket infrastructure; works through the Next.js proxy and standard HTTP.
- A single API instance is assumed. Scaling out would replace the in-process bus with Postgres
  `LISTEN/NOTIFY` behind the same `EventBus` port.
