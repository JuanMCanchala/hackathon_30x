# 05 · Prior art: what won before, and what Mandato adds

We studied winners of 2025–2026 hackathons with tracks close to this challenge (agents that pay
with limits and a human in the loop). The goal: match what judges already rewarded, then go
further.

## What winners did

| Project                                | Event                                                                             | Pattern that won                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AgentPay**                           | "Push to Prod" (Anthropic × Kaszek × Digital House), Buenos Aires 2026, 1st place | A shield that intercepts every agent payment, validates it against what was authorized and that the destination did not change. **Deterministic rules, not an AI watching an AI.** |
| **allowance.eth**                      | ETHGlobal New York 2026, ENS prize                                                | Spending rules written in natural language, compiled by Claude into a **validated JSON schema**; above a threshold the human signs with a readable summary.                        |
| **StableSettle**                       | ETHGlobal New York 2026, ENS prize                                                | Vault with total cap, per-transaction limit, 24 h limit and allowlist; the agent can only **request** spending; exposed as **MCP tools**.                                          |
| **ArcFlow**                            | HackMoney 2026, Treasury/Payouts track winner                                     | Corporate treasury with **role-based multi-signature**; judges rewarded "boring" real problems (payroll, invoices, vendors).                                                       |
| **VibePayments / Paguito**             | Interledger Hackathon CDMX 2025, 1st / community                                  | Multi-currency payroll and vendor payments; payments triggered from **WhatsApp**.                                                                                                  |
| **CallFlow**                           | AI Tinkerers Abu Dhabi "Humans-in-the-Loop", 1st                                  | **Confidence-based routing**: automate the routine, escalate the complex.                                                                                                          |
| HumanSign · AgentPayOps · HumanMandate | ETHGlobal / lablab showcases                                                      | One-tap mobile approval; approve/block/escalate with an audit dashboard; only raising limits needs a human.                                                                        |

The 30X × Colsubsidio edition (July 2026) rubric, readable in the HackRadar bundle, rewarded:
_the jury can walk the flow without the team's help_, _no black boxes — the team explains its
logic_, _a natural-language reason for every decision_, and _detect anomalies and ask before
saving_.

## How Mandato matches them

| Winning pattern                               | Mandato                                                                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic shield, not AI-judging-AI       | Policy engine in plain TypeScript; the LLM only extracts ([ADR-0002](../adr/0002-deterministic-engine-llm-only-extracts.md)).                      |
| Destination must not change                   | Payout destination must equal the registered one; otherwise `ESCALATE`.                                                                            |
| Natural-language rules → validated schema     | "Escríbelo en español": Claude compiles a policy change into a JSON patch validated by Zod; a human reviews the diff and the impact before saving. |
| Caps, per-tx and per-period limits, allowlist | Global policy + per-mandate caps and frequency.                                                                                                    |
| Agent can only request; MCP tools             | `apps/mcp`: `solicitar_pago`, `consultar_solicitud`, `ver_presupuesto`, `listar_beneficiarios`, with per-agent scopes.                             |
| Role-based multi-signature                    | Two distinct approvers above the dual-approval threshold.                                                                                          |
| One-tap mobile approval                       | HMAC-signed, single-use approval links with QR code.                                                                                               |
| Confidence routing                            | Per-field extraction confidence below the threshold → `ESCALATE`.                                                                                  |
| Audit dashboard                               | Append-only hash-chained ledger, CSV export for reconciliation.                                                                                    |
| Walkable without the team                     | One-click demo mode, offline replay of real extractions, guided trust-ladder screen.                                                               |

## What Mandato adds that we did not find in any winner

1. **The trust ladder.** Autonomy that grows through human-signed mandates proposed by the agent,
   measured month over month with the safety counter pinned at zero.
2. **Counterfactual receipts.** Not just _why_ — _what would have changed the outcome_, computed
   exactly from the rule trace.
3. **An independent auditor.** Invariants implemented separately from the engine (N-version style)
   re-check every payment; property-based tests attack the engine with thousands of random bills.
4. **A safety guarantee that survives a compromised reader.** Even if the extraction is wrong or
   injected, money can only go to registered destinations within signed bounds.
5. **What-if before saving rules.** Every policy change is replayed against history before it is
   saved: _"with this rule, 4 bills would have been paid automatically, 0 outside the rules"_.
6. **An attack lab** the jury can click.
7. **An evaluation harness in CI** with the challenge's own criteria as gates.

## Sources

- AgentPay — https://mercado.com.ar/innovacion/alumnos-de-la-universidad-de-san-andres-ganaron-un-hackaton-con-agentpay-antifraude
- allowance.eth — https://ethglobal.com/showcase/allowance-eth-ejosk
- StableSettle — https://ethglobal.com/showcase/stablesettle-iw6kh
- ArcFlow / HackMoney 2026 — https://www.arc.io/blog/meet-the-arc-track-winners-from-the-hackmoney-2026-hackathon-and-what-we-learned
- Interledger Hackathon 2025 winners — https://interledger.org/news/building-real-solutions-interledger-hackathon-winners-2025
- CallFlow — https://abu-dhabi.aitinkerers.org/hackathons/h_tV5wkIy3tdE/results
- HumanSign — https://ethglobal.com/showcase/humansign-ad6j1
- Ramp, best practices for AP agents — https://ramp.com/blog/agentic-ai/best-practices-for-ap-agents
