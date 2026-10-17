# API

The API is Hono with zod-openapi in [`apps/api/src/http`](../apps/api/src/http). The live
OpenAPI 3.1 spec is at `/openapi.json` and an interactive reference (Scalar) at `/docs`, both also
proxied by the web (`http://localhost:3000/docs`). Responses are JSON; errors are
`{ "error": "<Spanish message>" }`. Money is in integer **minor units** (`…Minor`), dates are ISO
strings on the simulated clock.

## Authentication

| Mode               | Reads (`GET`) | Writes (`POST`)                                                                                         |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| `DEMO_MODE=true`   | open          | open; demo routes mounted; actions name their `actor`                                                   |
| `DEMO_MODE=false`  | open          | `Authorization: Bearer <ADMIN_TOKEN>` (≥ 24 chars); the actor is `ADMIN_ACTOR`; demo routes not mounted |
| Self-authenticated | —             | `POST /api/v1/portal/{token}/reply` (the link token) and `POST /api/v1/webhooks/github` (the signature) |

CORS allows only `PUBLIC_WEB_URL`. Body limits: 1 MB for JSON and CSV, 10 MB per uploaded file.

## Status codes

`200` ok · `201` bill created · `202` webhook ignored · `400` invalid request or file · `401` missing
admin token or bad webhook signature · `404` unknown id or portal token · `409` state conflict (the
case is closed, the demo is busy, the amount cannot be approved) · `413` too large · `415`
unreadable format · `500` internal (logged, never detailed to the client).

## Routes

| Method | Path                                        | Tag                  | Auth (outside demo) | Body                                                       |
| ------ | ------------------------------------------- | -------------------- | ------------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/health`                            | —                    | —                   | —                                                          |
| GET    | `/api/v1/overview`                          | Panel                | —                   | —                                                          |
| GET    | `/api/v1/bills`                             | Cuentas              | —                   | —                                                          |
| GET    | `/api/v1/bills/{id}`                        | Cuentas              | —                   | —                                                          |
| POST   | `/api/v1/bills`                             | Cuentas              | admin               | `multipart/form-data`: `file` (PDF, `.eml`, `.txt`)        |
| POST   | `/api/v1/bills/{id}/resolve`                | Cuentas              | admin               | `{ action: "approve" \| "reject", note?, actor? }`         |
| GET    | `/api/v1/vendors`                           | Proveedores          | —                   | —                                                          |
| GET    | `/api/v1/conversations`                     | Proveedores          | —                   | —                                                          |
| GET    | `/api/v1/payments`                          | Pagos                | —                   | —                                                          |
| GET    | `/api/v1/reconciliation`                    | Pagos                | —                   | —                                                          |
| POST   | `/api/v1/evidence/deliverables/{id}/accept` | Evidencia            | admin               | `{ actor? }`                                               |
| POST   | `/api/v1/evidence/time-entries`             | Evidencia            | admin               | `text/csv`: `fecha,proveedor,proyecto,minutos,descripcion` |
| POST   | `/api/v1/webhooks/github`                   | Evidencia            | signature           | GitHub `pull_request` event (raw body)                     |
| GET    | `/api/v1/portal/{token}`                    | Portal del proveedor | token               | —                                                          |
| POST   | `/api/v1/portal/{token}/reply`              | Portal del proveedor | token               | `multipart/form-data`: `message` (≤ 5,000), `file?`        |
| GET    | `/api/v1/demo/tour`                         | Demo                 | demo only           | —                                                          |
| POST   | `/api/v1/demo/reset`                        | Demo                 | demo only           | —                                                          |
| POST   | `/api/v1/demo/actions/{action}`             | Demo                 | demo only           | —                                                          |
| GET    | `/openapi.json`, `/docs`                    | —                    | —                   | —                                                          |

## Bills

### `GET /api/v1/bills`

Every bill, most recent first, with the inline numbers the ledger needs.

```json
[
  {
    "id": "bill_…",
    "datasetId": "oct-03",
    "receivedAt": "2026-10-01T15:30:00-05:00",
    "channel": "pdf",
    "vendorName": "Daniela Ospina",
    "invoiceNumber": "DO-2026-09",
    "total": "20800000.00",
    "currency": "COP",
    "status": "PART_PAID",
    "statusLabel": "Pagada en parte",
    "outcome": "PAY_PART",
    "outcomeLabel": "Pagar una parte",
    "summary": "…",
    "amounts": { "billedMinor": 2080000000, "evidencedMinor": 1196000000 },
    "supersedesBillId": null,
    "casePaidMinor": 1196000000
  }
]
```

### `GET /api/v1/bills/{id}`

The receipt. `id` is a bill id or a dataset id (`oct-03`).

```json
{
  "bill": {
    "id": "…",
    "status": "…",
    "channel": "…",
    "document": { "filename": "…" },
    "askedAt": "…"
  },
  "vendor": {
    "id": "daniela-ospina",
    "name": "…",
    "payout": { "rail": "bre-b", "display": "Bre-B ···4512" }
  },
  "contract": { "id": "ct-daniela-ospina", "type": "hourly", "terms": [], "evidenceRuleText": "…" },
  "reading": { "vendorTaxId": "…", "lines": [], "confidence": { "total": 1 } },
  "readingMeta": {
    "provider": "openrouter",
    "model": "deepseek/deepseek-v4.1-flash",
    "cacheHit": true
  },
  "matches": [{ "lineIndex": 0, "termId": "ospina-horas", "confidence": 0.97, "reason": "…" }],
  "outcome": "PAY_PART",
  "summary": "…",
  "counterfactual": ["…"],
  "vendorMessage": "Facturaste 160 h y hay registro de 92 h. …",
  "checks": [
    {
      "id": "evidence.coverage",
      "stage": "evidencia",
      "status": "fail",
      "onFail": "PAY_PART",
      "label": "Evidencia de entrega",
      "detail": "…",
      "remedy": "…"
    }
  ],
  "lines": [
    { "billedMinor": 0, "evidencedMinor": 0, "status": "partial", "evidence": [], "supporting": [] }
  ],
  "amounts": {
    "currency": "COP",
    "billedMinor": 0,
    "evidencedMinor": 0,
    "alreadyPaidMinor": 0,
    "payNowMinor": 0,
    "askMinor": 0
  },
  "engineVersion": "recibido-engine-1",
  "decisions": [{ "seq": 1, "at": "…", "outcome": "PAY_PART", "payNowMinor": 0 }],
  "payments": [
    {
      "reference": "RCB-0007",
      "rail": "bre-b",
      "plan": { "payOn": "…", "yieldKeptUsdMinor": 0, "feesSavedUsdMinor": 0 },
      "destinationDisplay": "…"
    }
  ],
  "messages": [{ "sender": "agent", "body": "…" }],
  "humanActions": [],
  "chain": [{ "id": "…", "datasetId": "oct-03-r1", "status": "PAID" }],
  "headBillId": "…"
}
```

Values above are illustrative. Payout destinations are never returned in full: vendors and
payments carry only a masked display.

### `POST /api/v1/bills`

Uploads a document and decides it. Always a **new** bill: a correction can only arrive through the
portal ([ADR-0006](adr/0006-revisions-through-a-verified-chain.md)). The same bytes twice return
the existing bill with `200` and `duplicateDocument: true`.

```bash
curl -F file=@cuenta.pdf http://localhost:4000/api/v1/bills
```

```json
{ "billId": "bill_…", "duplicateDocument": false, "outcome": "ASK_VENDOR", "summary": "…" }
```

Without a model key, a document with no recorded reading escalates as unreadable.

### `POST /api/v1/bills/{id}/resolve`

A person approves or rejects an `ESCALATED` bill. Approving pays what the case still owes, to the
registered destination only. `409` when the bill is not escalated, or when its amount or currency
was not read with certainty.

```json
{ "action": "approve", "note": "Confirmado con Thiago por teléfono.", "actor": "Diego Navarro" }
```

```json
{ "status": "APPROVED", "paymentReference": "RCB-0012" }
```

## Organization views

| Route                        | Returns                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/overview`       | `{ clock, scorecard, violations, byStatus, timeline }`: the scorecard is computed with the eval's code and `violations` is the independent checker over every payment.                     |
| `GET /api/v1/vendors`        | Vendors with their contracts, evidence rule and masked payout, and how many bills each has.                                                                                                |
| `GET /api/v1/conversations`  | One thread per case with the vendor (the simulated inbox); in demo mode each open thread carries a signed portal link.                                                                     |
| `GET /api/v1/payments`       | Payments in creation order with rail, plan, status and reference.                                                                                                                          |
| `GET /api/v1/reconciliation` | `{ rows, unmatchedPayments, totals }`: each statement line with its status (`matched`, `matched_fx`, `fee`, `returned`, `unmatched`), FX difference, payment, bill, contract and evidence. |

## Evidence

- `POST /api/v1/evidence/deliverables/{id}/accept` — the client's PM accepts a pending deliverable
  (e.g. `entregable-brand-kit-v2`); the vendor's open bills are re-decided.
- `POST /api/v1/evidence/time-entries` — CSV export of a time tracker, header
  `fecha,proveedor,proyecto,minutos,descripcion` (`proveedor` is a vendor id or name; the
  description may contain commas). Imported items are `origin: csv`.

```bash
curl -H 'content-type: text/csv' --data-binary @horas.csv http://localhost:4000/api/v1/evidence/time-entries
```

### `POST /api/v1/webhooks/github`

Configure the repository's webhook with content type `application/json`, the `Pull requests`
event and the secret in `GITHUB_WEBHOOK_SECRET`. The API verifies `X-Hub-Signature-256`
(HMAC-SHA256 of the raw body, timing-safe) and reads `X-GitHub-Event`.

| Result                                 | Response                          |
| -------------------------------------- | --------------------------------- |
| Valid signature, tracked PR            | `200 { accepted: true, changed }` |
| Other event, untracked PR              | `202 { ignored: "<reason>" }`     |
| Bad signature, or no secret configured | `401`                             |

A merged PR becomes `pr_merged` evidence and the vendor's open bills are re-decided; the engine
still checks everything else ([ADR-0011](adr/0011-github-polling-and-signed-webhook.md)).

## Vendor portal

### `GET /api/v1/portal/{token}`

What the vendor sees: its bill (number, dates, total, status), the conversation, each line's
billed and evidenced amounts, what is still asked for, and `canReply`. Never payout details.
Unknown or forged token → `404`.

### `POST /api/v1/portal/{token}/reply`

A message, a corrected bill, or both. A corrected bill supersedes the case head (same vendor
only) and is decided with the case's history; a message alone re-decides the bill with the message
in its text. `409` when the case no longer waits for an answer.

```bash
curl -F message='Adjunto la cuenta corregida por 92 h.' -F file=@corregida.pdf \
  http://localhost:4000/api/v1/portal/<token>/reply
```

```json
{ "billId": "bill_…", "outcome": "PAY", "summary": "…" }
```

## Demo (only with `DEMO_MODE=true`)

| Route                                        | Effect                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/demo/tour`                      | Phase (`idle`, `september`, `arriving`, `october`, `closed`), actions done and available, problems.                                                         |
| `POST /api/v1/demo/reset`                    | Empties the organization, seeds Altamar Labs on September 1 and lives through September; ends on October 1, 08:00.                                          |
| `POST /api/v1/demo/actions/arrive-october`   | The 22 October bills arrive one by one in the background (`DEMO_PACE_MS` apart).                                                                            |
| `POST /api/v1/demo/actions/reply-daniela`    | Daniela answers `oct-03` with the corrected bill for 92 h.                                                                                                  |
| `POST /api/v1/demo/actions/accept-brand-kit` | Lina accepts the Brand kit v2; `oct-04` pays.                                                                                                               |
| `POST /api/v1/demo/actions/merge-pr`         | Without `GITHUB_REPO`, stores the dataset's merge of PR #3; with it, moves the clock to the merge moment and waits for the real merge (polling or webhook). |
| `POST /api/v1/demo/actions/close-october`    | The rest of October in script order, then the November 10 close and the Blinka statement.                                                                   |

One action runs at a time; a second one while another runs gets `409`.
