# 03 · Personas and journeys

## Personas (Altamar Labs, the demo company)

| Persona                                        | Role                                     | Wants                                                                 | In Recibido                                                            |
| ---------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Paula Herrera**                              | Finance, operates AP                     | Stop chasing project leads on Slack; pay right and on time.           | Reads the ledger and the receipts; uploads bills; sees reconciliation. |
| **Diego Navarro**                              | CFO, approver                            | Be asked only about what truly needs a person, with the reason.       | Approves or rejects escalations from the receipt.                      |
| **Lina Cárdenas**                              | Product manager                          | Accept a deliverable once, without a payment conversation.            | Accepts deliverables; that acceptance is the evidence.                 |
| **Daniela Ospina** (and the other contractors) | Contractor in Colombia, Mexico or Brazil | Get paid fast; know exactly what is missing.                          | Receives a message with the gap; answers in the portal.                |
| **Blinka**                                     | The bank                                 | Payments over its local rails, cash kept in yield until the due date. | The simulated rail and statement; rail and timing per payment.         |

## Journeys

### 1. A bill that pays itself (Julián, `oct-02`)

Julián bills 120 h of September. Toggl has 120 h in the `app-web` project for the period and 9
merged PRs back them. All 18 checks pass → **PAY**, planned over Bre-B on the due date. Nobody is
involved; the receipt shows why.

### 2. Pay what is proven, ask for the rest (Daniela, `oct-03`)

Daniela bills 160 h; Toggl has 92 h. Her contract allows partial payment → **PAY PART** for
92 h, and a Spanish message: "Facturaste 160 h y hay registro de 92 h. ¿Puedes adjuntar el resto o
corregir la cuenta?". She answers in the portal with a corrected bill for 92 h. The corrected bill
inherits what the case paid, so nothing more is paid, and the case closes without a person.

### 3. Evidence arrives later (Estudio Ceiba `oct-04`, Andrés `oct-05`)

The Brand kit v2 has no accepted deliverable → **ASK VENDOR**. Lina accepts the files; the bill is
re-decided and pays, citing the acceptance. Andrés's milestone M3 waits on PR #3; it is merged on
GitHub and the bill pays within seconds, citing the PR.

### 4. What a person must see (Thiago `oct-06`, Nimbo `oct-13`, Guadua `oct-14`)

A new Pix key in the e-mail body → **ESCALATE**; Diego approves paying only the registered key. A
company that is not a registered vendor → Diego rejects it. 60 desks over the USD 20,000 auto-pay
limit → Diego approves. Each reaches Diego with one sentence that says why.

### 5. The vendor did not answer (Estudio Ceiba, `oct-16`)

The landing has no accepted deliverable and the studio does not answer in the 5 days its contract
gives. The clock moves past the deadline and the case escalates to a person.

### 6. Close of the month (reconciliation)

On November 10 the Blinka statement arrives. Each line is matched to its payment by reference, or
by amount and date; FX differences against the plan, transfer fees, a returned Pix payment and an
unexplained card charge are flagged; each line links to its bill, contract and evidence.

Next: [04 · Success metrics](04-success-metrics.md).
