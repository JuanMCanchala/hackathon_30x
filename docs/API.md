# API

Mandato's HTTP API is the only way into the system: the web app, the MCP server and the evaluation
harness all go through the same services. It is described with OpenAPI 3.1:

- Interactive reference (Scalar): `http://localhost:4000/docs`
- OpenAPI document: `http://localhost:4000/openapi.json`

Through the web app, both are also served at `/docs` and `/openapi.json` (Next.js proxies `/api/*`
to the API, so the browser talks to a single origin, ADR-0016).

## Conventions

- **Language.** Messages, summaries and receipts are in Spanish, for the people who read them.
  Field names of the internal API are English; the external agent API speaks Spanish end to end.
- **Money.** Amounts travel as canonical decimal strings (`"1200.00"`) with an ISO 4217 currency,
  and are stored as integer minor units. Nothing is a float (ADR-0007).
- **Who is acting.** In demo mode the caller picks a demo user with the `x-mandato-user` header
  (`usr_laura`, `usr_martin`, `usr_sofia`); permissions come from that user (only Martín and Sofía
  can approve, sign agreements or change the policy). In production an identity provider sits in
  front of the API; approval links stay as capabilities.
- **Errors.** Every error has the same envelope and a stable `code`:

  ```json
  {
    "error": { "code": "forbidden", "message": "Laura Méndez no tiene permiso para aprobar pagos." }
  }
  ```

  | Status | Codes                                                       |
  | ------ | ----------------------------------------------------------- |
  | 400    | `bad_request`, `validation_error` (with `issues`)           |
  | 401    | `unauthorized`, `invalid_link`, `link_expired`              |
  | 403    | `forbidden`, `demo_disabled`                                |
  | 404    | `not_found`                                                 |
  | 409    | `conflict`, `link_used`                                     |
  | 413    | `too_large`                                                 |
  | 422    | `not_compilable` (a policy sentence that cannot be applied) |

## Endpoints

### Bills and receipts

| Method | Path                                                 | What it does                                                                   |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/api/v1/invoices`                                   | Ingests a bill: `multipart/form-data` with `file`, or JSON `{ text, channel }` |
| GET    | `/api/v1/invoices`                                   | Lists bills; filters `status`, `period`, `q`, `source`, `limit`                |
| GET    | `/api/v1/invoices/{id}`                              | The full receipt: rules, counterfactual, extraction, approvals, ledger trail   |
| GET    | `/api/v1/invoices/{id}/document`                     | The original document (`/view` returns e-mails and chats parsed as JSON)       |
| GET    | `/api/v1/invoices/{id}/document/attachments/{index}` | An attachment of an e-mailed bill                                              |
| GET    | `/api/v1/events`                                     | Server-sent events (see below)                                                 |

Uploading the same bytes twice returns the existing bill (`200` instead of `201`).

```bash
curl -F file=@packages/dataset/files/agosto/ago-02-tablero-email.eml \
     -H 'x-mandato-user: usr_laura' http://localhost:4000/api/v1/invoices

curl -H 'content-type: application/json' -H 'x-mandato-user: usr_laura' \
     -d '{"text":"Hola, te paso la cuenta de cobro RM-003 por 9.000.000 COP, llave @rafamendoza","channel":"chat"}' \
     http://localhost:4000/api/v1/invoices
```

### Approvals

| Method   | Path                                   | What it does                                                        |
| -------- | -------------------------------------- | ------------------------------------------------------------------- |
| GET      | `/api/v1/approvals`                    | The queue of escalated bills                                        |
| POST     | `/api/v1/invoices/{id}/approve`        | Approves (one of two signatures above the dual-approval threshold)  |
| POST     | `/api/v1/invoices/{id}/reject`         | Rejects                                                             |
| POST     | `/api/v1/invoices/{id}/approval-links` | Issues a signed, single-use link for one approver (ADR-0012)        |
| GET/POST | `/api/v1/approval-links/{token}`       | What the phone page reads and acts on; no session needed, used once |

### Agreements, proposals and the registry

| Method | Path                              | What it does                                                    |
| ------ | --------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/payees`                  | Registered payees with their current agreement and totals       |
| PATCH  | `/api/v1/payees/{id}/destination` | Changes payment details after verifying them by another channel |
| PATCH  | `/api/v1/payees/{id}/status`      | Blocks or enables a payee                                       |
| GET    | `/api/v1/mandates`                | Signed agreements, every version                                |
| POST   | `/api/v1/mandates`                | Signs a new agreement or a new version                          |
| POST   | `/api/v1/mandates/{id}/revoke`    | Revokes an agreement: its bills go back to asking               |
| GET    | `/api/v1/proposals`               | The agent's proposals, with their impact on history             |
| POST   | `/api/v1/proposals/{id}/accept`   | Signs the proposal (creates or versions the agreement)          |
| POST   | `/api/v1/proposals/{id}/reject`   | Rejects it; nothing changes                                     |

### Rules and policy

| Method | Path                     | What it does                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------- |
| GET    | `/api/v1/rules`          | The catalogue of the 23 rules the engine evaluates ([RULES.md](RULES.md)) |
| GET    | `/api/v1/policy`         | The policy in force and its versions                                      |
| POST   | `/api/v1/policy/preview` | What-if: replays the whole history under proposed terms                   |
| POST   | `/api/v1/policy/compile` | Turns a Spanish sentence into a validated policy change (needs a model)   |
| PUT    | `/api/v1/policy`         | Saves a new policy version (signers only)                                 |

### Payments, questions and drafts

| Method | Path                                | What it does                                                               |
| ------ | ----------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/v1/payments`                  | Scheduled, sent and settled transfers, and the balance they leave          |
| POST   | `/api/v1/payments/run`              | Sends what is due today and settles what has arrived (ADR-0018)            |
| POST   | `/api/v1/ask`                       | "Pregúntale a Mandato": answers in Spanish citing receipts; read-only      |
| POST   | `/api/v1/invoices/{id}/reply-draft` | Drafts the reply to the vendor from the decision's reasons; never sends it |
| GET    | `/api/v1/radar`                     | Recent bills with anomaly signals (amount, repetition, timing)             |

### Oversight

| Method | Path                         | What it does                                                    |
| ------ | ---------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/overview`           | Autonomy per month, budget, balance, pending work, latest audit |
| POST   | `/api/v1/audit`              | Runs the independent auditor over the ledger                    |
| GET    | `/api/v1/audit/latest`       | The latest audit report                                         |
| GET    | `/api/v1/ledger`             | Ledger entries, newest first                                    |
| GET    | `/api/v1/ledger/export.json` | The whole hash-chained ledger, to verify elsewhere              |
| GET    | `/api/v1/reconciliation.csv` | One row per bill for accounting (UTF-8 with BOM for Excel)      |
| GET    | `/api/v1/agents`             | Connected external agents and their scope                       |
| GET    | `/api/v1/session`            | The current user, the demo users and the server's capabilities  |
| GET    | `/api/v1/health`             | Liveness                                                        |

### Demo (only when `DEMO_MODE=true`)

| Method | Path                               | What it does                                             |
| ------ | ---------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/demo/catalog`             | Guided months, live files and attacks, with their state  |
| POST   | `/api/v1/demo/reset`               | Resets Andes Labs to 31 July 2026                        |
| POST   | `/api/v1/demo/months/{period}/run` | Processes `2026-08` or `2026-09` with the team's actions |
| POST   | `/api/v1/demo/live/{id}`           | Uploads a live file (`vivo-01`…) with the real clock     |
| POST   | `/api/v1/demo/attacks/{id}`        | Launches an attack (`atk-01`…`atk-11`)                   |
| GET    | `/api/v1/demo/files/{id}`          | Downloads a dataset file                                 |

## Real-time events

`GET /api/v1/events` is a server-sent event stream. The web app keeps one connection open and
revalidates what it shows on every event. Event types: `invoice.decided`, `invoice.approved`,
`invoice.rejected`, `approval.recorded`, `proposal.created`, `proposal.resolved`,
`policy.changed`, `registry.changed`, `audit.completed`, `demo.reset`, `demo.progress`, plus
`ready` on connect and a `ping` every 15 seconds.

The stream is sent with `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, so
compressing or buffering proxies pass events through as they happen.

## External agents

Other AI agents can ask Mandato to pay, under the same rules and with a narrower scope of their
own (ADR-0013). They authenticate with a bearer key (stored as a SHA-256 hash) and **can never
approve, sign or change rules**.

| Method | Path                              | What it does                                                   |
| ------ | --------------------------------- | -------------------------------------------------------------- |
| POST   | `/agent/v1/payment-requests`      | Requests a payment; answers with the decision and its receipt  |
| GET    | `/agent/v1/payment-requests/{id}` | Follows up on its own request (e.g. whether a person approved) |
| GET    | `/agent/v1/budget`                | Remaining budget this month and the agent's scope              |
| GET    | `/agent/v1/payees`                | Registered payees, with masked payment details                 |

The demo agent, "Agente de compras", may request software up to USD 1,000 per payment.

```bash
curl -X POST http://localhost:4000/agent/v1/payment-requests \
  -H 'authorization: Bearer mnd_demo_agente_compras_2026' \
  -H 'content-type: application/json' \
  -d '{
    "beneficiario": { "nombre": "Altamar Hosting LLC", "id_fiscal": "EIN 85-3344556", "pais": "US" },
    "numero_factura": "ALT-2026-10",
    "fecha_emision": "2026-10-15",
    "fecha_vencimiento": "2026-10-30",
    "periodo_servicio": "2026-10",
    "moneda": "USD",
    "monto": "912.40",
    "concepto": "Servidores y base de datos — octubre 2026",
    "categoria": "software"
  }'
```

```json
{
  "id": "inv_9eb0667e980d41e2bc2b",
  "referencia": "MND-0001",
  "estado": "PAID",
  "estado_legible": "pagada por el agente",
  "decision": "PAY",
  "resumen": "Pagada sola: Altamar Hosting cobra USD 912,40 y cumple el acuerdo firmado (hasta USD 2.500,00 por factura, 1 factura y tope de USD 2.500,00 al mes). Está dentro del límite por pago y del presupuesto de octubre.",
  "que_falto": [],
  "reglas": [
    { "regla": "Es una cuenta por pagar", "resultado": "cumple", "detalle": "Es una factura." }
  ],
  "aprobaciones_requeridas": 0,
  "ver_en": "http://localhost:3000/facturas/inv_9eb0667e980d41e2bc2b"
}
```

`reglas` lists all 23 checks. The payment destination is never taken from the request: Mandato
pays the payee's registered destination, and a request whose `destino` differs is escalated.

### MCP server

[`apps/mcp`](../apps/mcp) wraps the agent API as an MCP server over stdio, so any MCP client
(Claude Code, Claude Desktop, an agent framework) can use it:

| Tool                   | What it does                                    |
| ---------------------- | ----------------------------------------------- |
| `solicitar_pago`       | Requests a payment and returns the full receipt |
| `consultar_solicitud`  | Follows up on a previous request                |
| `ver_presupuesto`      | Remaining budget and the agent's own limits     |
| `listar_beneficiarios` | Registered payees (payment details masked)      |

There is deliberately no tool to approve, sign or change rules.

```bash
claude mcp add mandato \
  --env MANDATO_API_URL=http://localhost:4000 \
  --env MANDATO_AGENT_KEY=mnd_demo_agente_compras_2026 \
  -- pnpm --dir apps/mcp dev
```

For Claude Desktop, build it (`pnpm --filter @mandato/mcp build`) and point the client to
`node apps/mcp/dist/index.js` with the same two variables.
