# Architecture Decision Records

Each ADR captures one decision, the context that forced it and its consequences. Format: Michael
Nygard's template. Status values: _Proposed_, _Accepted_, _Superseded by ADR-XXXX_.

| ADR                                                         | Decision                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [0001](0001-record-architecture-decisions.md)               | Record architecture decisions                                                  |
| [0002](0002-deterministic-engine-llm-only-extracts.md)      | A deterministic policy engine decides; the LLM only extracts                   |
| [0003](0003-three-outcomes-deny-by-default.md)              | Three outcomes with deny-by-default aggregation                                |
| [0004](0004-mandates-humans-sign-agreements.md)             | Mandates: humans sign agreements, the agent only proposes                      |
| [0005](0005-counterfactual-receipts-from-rule-traces.md)    | Explanations and counterfactuals are generated from rule traces, not by an LLM |
| [0006](0006-hash-chained-ledger-and-independent-auditor.md) | Append-only hash-chained ledger and an independent auditor                     |
| [0007](0007-money-integer-minor-units-conservative-fx.md)   | Money as integer minor units; conservative, versioned FX                       |
| [0008](0008-hexagonal-monorepo.md)                          | Hexagonal architecture in a pnpm monorepo with a pure domain package           |
| [0009](0009-postgres-drizzle-pglite.md)                     | PostgreSQL with Drizzle; PGlite for zero-infrastructure runs and tests         |
| [0010](0010-claude-extraction-with-record-replay.md)        | Extraction with Claude, with a record/replay cache for reproducible runs       |
| [0011](0011-serialized-decisions-per-organization.md)       | Serialize state-changing operations per organization                           |
| [0012](0012-signed-approval-links-and-dual-approval.md)     | One-time signed approval links and dual approval                               |
| [0013](0013-mcp-gateway-for-external-agents.md)             | An MCP gateway with scoped keys for external agents                            |
| [0014](0014-server-sent-events.md)                          | Real-time updates with Server-Sent Events                                      |
| [0015](0015-evaluation-harness-as-ci-gate.md)               | The evaluation harness is a CI quality gate                                    |
| [0016](0016-nextjs-frontend-spanish-ui.md)                  | Next.js App Router frontend with a Spanish UI behind an API proxy              |
