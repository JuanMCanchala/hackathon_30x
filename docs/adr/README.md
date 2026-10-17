# Architecture Decision Records

Each ADR captures one decision, the context that forced it and its consequences, in Michael
Nygard's format. Status values: _Proposed_, _Accepted_, _Superseded by ADR-XXXX_. Most of these
decisions were taken, and reviewed, while the system was built on 2026-10-17.

| ADR                                                     | Decision                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [0001](0001-record-architecture-decisions.md)           | Record architecture decisions                                                      |
| [0002](0002-deterministic-engine-llm-reads-and-maps.md) | A deterministic engine decides; the language model only reads and maps lines       |
| [0003](0003-five-outcomes-deny-by-default.md)           | Five outcomes, aggregated deny by default                                          |
| [0004](0004-structural-evidence-links.md)               | Evidence links are structural; the model maps lines to terms, never to evidence    |
| [0005](0005-vendor-first-loop-and-payout-lock.md)       | Ask the vendor before a person; the vendor can never change the payout             |
| [0006](0006-revisions-through-a-verified-chain.md)      | Corrected bills chain only through the portal token; the case carries what it paid |
| [0007](0007-record-and-replay-of-model-calls.md)        | Record and replay every model call                                                 |
| [0008](0008-simulated-rail-and-statement.md)            | The Blinka rail and its bank statement are simulated behind a port                 |
| [0009](0009-hexagonal-monorepo-postgres-pglite.md)      | Hexagonal pnpm monorepo; PostgreSQL with Drizzle, PGlite without infrastructure    |
| [0010](0010-simulated-clock.md)                         | Business time is a simulated clock stored in the database                          |
| [0011](0011-github-polling-and-signed-webhook.md)       | GitHub evidence by polling and by a signed webhook                                 |
| [0012](0012-nextjs-spanish-ui-behind-a-proxy.md)        | Next.js App Router web with a Spanish UI behind an API proxy                       |
| [0013](0013-admin-token-and-signed-portal-links.md)     | An admin token outside demo mode and HMAC-signed portal links                      |
| [0014](0014-evaluation-as-ci-gate.md)                   | The evaluation is a CI gate and requires the recordings                            |
| [0015](0015-serialized-decisions-per-organization.md)   | Serialize every decision of an organization                                        |
