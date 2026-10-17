# Mandato

> **Firma acuerdos, no pagos.** An accounts-payable agent that pays what the company signed for,
> holds what looks wrong and asks a person about everything else — with the exact reason and what
> would have made the bill payable.

Built for **Blinka's challenge _"Agentes que pagan por la empresa"_** at the 30X Hackathon
(October 2026).

**En español.** Mandato lee las facturas que llegan en PDF, foto, correo o WhatsApp y decide
pagar, frenar o preguntar. Solo paga lo que cabe en un acuerdo firmado por una persona, al destino
registrado y dentro de los límites; todo lo demás llega a un humano con el motivo exacto. Cada
aprobación le enseña al agente un acuerdo nuevo que una persona firma o rechaza, así que la
autonomía sube mes a mes mientras los pagos indebidos se quedan en cero.

![Mandato's landing: "Firma acuerdos, no pagos", with a live demo where you tap a bill and watch the agent check it and decide](docs/images/landing.webp)

![The overview: the trust ladder climbs from 53 % in August to 71 % in September, and the independent auditor finds zero payments outside the rules](docs/images/overview.webp)

## Results

Measured by `pnpm eval`, which runs the real services over a labelled set of bills and gates CI
([EVALUATION.md](docs/EVALUATION.md)), here with the real readings of DeepSeek V4.1 Flash:

| Fictitious company Andes Labs Inc. |    August 2026 |  September 2026 |
| ---------------------------------- | -------------: | --------------: |
| Bills decided without a person     | 9 of 17 (53 %) | 12 of 17 (71 %) |
| Decisions equal to the expected    |       17 of 17 |        17 of 17 |
| Payments outside the rules         |          **0** |           **0** |

- **Autonomy climbs because people sign agreements**, not because rules loosen: between the two
  months the team approved bills and signed four agreements the agent proposed.
- **All 11 attacks are stopped** (duplicates in disguise, a changed bank account, hidden
  instructions in white text, look-alike names, inflated amounts, an agent asking beyond its
  scope…), and the only attack bill paid is the valid half of a split charge.
- **The independent auditor finds 0 violations** and an intact hash chain over 22 payments and 49
  decisions.
- **Reading is not the weak link**: DeepSeek V4.1 Flash read 480 of 480 critical fields right
  across PDFs, phone photos, e-mails and WhatsApp chats, so the end-to-end run matches the perfect
  reader decision for decision.

## How it decides

```mermaid
flowchart LR
  bill["Bill<br/>PDF · photo · e-mail · WhatsApp · agent request"] --> reader["Reader<br/>language model, JSON-schema output<br/>+ deterministic injection scanner"]
  reader -- "facts with confidence" --> engine{"Policy engine<br/>23 rules, pure code"}
  registry[("Registry<br/>payees · signed mandates · policy")] --> engine
  engine -- PAY --> paid["Paid to the<br/>registered destination"]
  engine -- HOLD --> held["Held<br/>duplicate, manipulation"]
  engine -- ESCALATE --> person["A person approves or rejects<br/>web or one-tap phone link"]
  person --> proposal["The agent proposes the agreement<br/>that would have paid it"]
  proposal -- "a person signs" --> registry
  paid & held & person --> ledger[("Hash-chained ledger")] --> auditor["Independent auditor"]
```

The language model **reads**; it never decides. A deterministic engine evaluates 23 rules in six
stages (reading, payee, duplicates, mandate, policy, requester) and aggregates them
deny-by-default: any hold failure holds, any other failure or check it could not run escalates,
and only a clean sweep pays. So a forged or manipulated bill can at worst be paid to a payee the
company already pays, for an amount the company already signed for — and even that reaches a
person if anything is off ([RULES.md](docs/RULES.md), [ADR-0002](docs/adr/0002-deterministic-engine-llm-only-extracts.md)).

## What sets it apart

1. **Mandates, not permissions.** People sign standing agreements (to whom, how much, how often).
   After every approval the agent proposes the agreement that would have paid it alone, with its
   impact on history; a person signs or rejects it. The agent never edits its own rules.
2. **A receipt for every decision.** The outcome stamp, the reason in plain Spanish, what would
   have to be true to pay it (the counterfactual), all 23 checks, what the reader extracted with
   its confidence, the original document and its ledger entries.
3. **What-if before changing a rule.** Edit the policy, or write it in Spanish and let the
   language model compile it, and Mandato replays the whole history to show which bills would
   have been decided differently — before anything is saved.
4. **An attack lab and an auditor that does not trust the engine.** Eleven adversarial bills on
   demand, each with the rule that must catch it, and an auditor written apart from the engine
   that re-checks every payment against ten invariants and the ledger's hash chain.
5. **Other agents can pay through it.** An MCP server lets external AI agents request payments
   under the same rules and a narrower scope; there is no tool to approve, sign or change rules.
6. **The money actually leaves — on the due date.** Every paid or approved bill gets a transfer
   scheduled for its due date (never before, never late), through the payee's rail (Bre-B, SPEI,
   Pix in seconds; ACH and wires in days), to the destination registered _when the money leaves_.
   A tenth audit invariant checks every transfer ([ADR-0018](docs/adr/0018-paying-decided-bills-on-their-due-date.md)).
7. **Ask it, in Spanish.** "Pregúntale a Mandato" answers questions about bills, payments and
   agreements from a read-only snapshot, citing the receipts it used. It cannot pay or approve.
8. **It writes back to the vendor.** On any receipt, the agent drafts the reply from the
   decision's own reasons, in the vendor's language, for a person to send by WhatsApp or e-mail.
9. **An anomaly radar.** Amounts far from a payee's usual, a second bill within days, a bill off
   its usual date: signals for whoever approves, without blocking what the rules already decided.

## Screens

<table>
  <tr>
    <td width="66%"><img src="docs/images/receipt.webp" alt="A held bill: the stamp, the reason, what would have to be true to pay it, and the checks that failed"></td>
    <td><img src="docs/images/approval-phone.webp" alt="The signed one-time approval link opened on a phone" width="250"></td>
  </tr>
  <tr>
    <td><sub><b>Decision receipt.</b> Held: the same invoice was already paid. Every check, the reading and the ledger trail.</sub></td>
    <td><sub><b>One tap from a phone.</b> A signed link for one approver, single use, 24 hours.</sub></td>
  </tr>
</table>

<table>
  <tr>
    <td><img src="docs/images/rules-what-if.webp" alt="Lowering the per-payment limit replays the whole history before saving"></td>
    <td><img src="docs/images/attack-lab.webp" alt="The attack lab: eleven attacks and the rule that caught each one"></td>
  </tr>
  <tr>
    <td><sub><b>What-if.</b> Lower the limit and see which past bills would have been decided differently.</sub></td>
    <td><sub><b>Attack lab.</b> Eleven tricks to get a payment out; each shows the rule that caught it.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/audit-dark.webp" alt="The independent audit and the hash-chained ledger, dark theme"></td>
    <td><img src="docs/images/overview-dark.webp" alt="The overview in the dark theme"></td>
  </tr>
  <tr>
    <td><sub><b>Independent audit.</b> Nine invariants re-checked outside the engine.</sub></td>
    <td><sub><b>Dark theme.</b> Outcome colors validated for color-vision deficiency in both themes.</sub></td>
  </tr>
</table>

## Run it

```bash
pnpm install
cp env.example .env      # optional: a FIREWORKS_API_KEY or ANTHROPIC_API_KEY reads new uploads
pnpm dev                 # web on http://localhost:3000, API on :4000 (docs at /docs)
```

Or with PostgreSQL in containers: `docker compose up --build`. Then open **Recorrido guiado** and
process August and September. Details, including Railway: [DEPLOY.md](docs/DEPLOY.md). The demo
script for the jury, in Spanish: [DEMO.md](docs/DEMO.md).

**Reading documents.** The demo documents replay DeepSeek V4.1 Flash's recorded readings, so no
key is needed to try it. With `FIREWORKS_API_KEY` (DeepSeek V4.1 Flash on Fireworks) or
`ANTHROPIC_API_KEY` (Claude), the model also reads new uploads live and compiles rules written in
Spanish; every receipt names the model that read it ([ADR-0017](docs/adr/0017-openai-compatible-reader-deepseek-on-fireworks.md)).

## Architecture

```
apps/api          Hono + OpenAPI · Drizzle on PostgreSQL or PGlite · SSE · LLM readers · auditor
apps/web          Next.js 16 · Tailwind 4 · Spanish UI · landing + app · light and dark themes
apps/mcp          MCP server (stdio) for external agents
packages/domain   the pure engine: 23 rules, money, mandates, proposals, ledger, audit
packages/dataset  Andes Labs: payees, mandates, 48 rendered documents, attacks, the team's actions
docs/             product, system design, 17 ADRs, rules, security, evaluation, API, deployment
```

Hexagonal: the domain package has no I/O and is shared by the API, the evaluation harness and the
web app. State-changing operations are serialized per organization so two simultaneous bills cannot
spend the same budget. Money is integer minor units with conservative, versioned exchange rates.
Everything that happens is appended to a SHA-256 hash-chained ledger.

| Read next                                                                       |                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| [Problem](docs/product/01-problem.md) · [Solution](docs/product/02-solution.md) | Why mandates, for whom                           |
| [System design](docs/SYSTEM_DESIGN.md)                                          | Requirements, C4, data model, failure modes      |
| [Architecture decisions](docs/adr/README.md)                                    | 17 ADRs                                          |
| [Rules](docs/RULES.md) · [Security](docs/SECURITY.md)                           | The 23 checks; threats and mitigations           |
| [Dataset](docs/DATASET.md) · [Evaluation](docs/EVALUATION.md)                   | The company, the months, the attacks, the scores |
| [API](docs/API.md)                                                              | REST, events, agent gateway and MCP              |

## Scope

- **No money moves.** Mandato decides; a `PaymentRail` port would hand `PAID` and `APPROVED` bills
  to Blinka's API, Bre-B, SPEI or Pix.
- **Fictitious data.** Andes Labs, its people, payees, accounts and documents are invented, and
  the exchange rates are simulated.
- **Demo identity.** A user switcher stands in for authentication; with `DEMO_MODE=false` user
  endpoints refuse every request until an identity provider is configured.
