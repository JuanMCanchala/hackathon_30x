# ADR-0013: An MCP gateway with scoped keys for external agents

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

"Companies are building their own agents and want them to pay too." Those agents should not get
bank credentials or their own rules: they should go through the same policy, the same receipts and
the same humans.

## Decision

- External agents are principals with an API key (stored as SHA-256) and a **scope**: allowed
  payee categories and a maximum USD amount per request.
- `apps/mcp` is a Model Context Protocol server (stdio) exposing `solicitar_pago`,
  `consultar_solicitud`, `ver_presupuesto` and `listar_beneficiarios`. It calls the API's
  `/agent/v1` endpoints with the agent's key.
- Agent requests become bills with `source = agent`, are decided by the same engine and get one
  extra rule: the requester must be within its scope (failure → `HOLD`).
- Agents can never approve, sign or change rules; those endpoints do not exist for agent keys.

## Consequences

- Mandato becomes infrastructure: "connect your agent, pay under our rules" — a natural product
  for a business-account provider like Blinka.
- The same receipts are returned to the calling agent, so it can explain the outcome to its user.
