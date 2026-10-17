# 02 · The solution: a goods-received note for services, built from evidence

Recibido builds the missing goods-received note out of **digital evidence** and runs a three-way
match on every services bill.

| Leg      | Source                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract | Rate, monthly cap, currency, payee, payment terms, early-payment discount, and the **evidence rule**.                                         |
| Evidence | Hours in Toggl, merged PRs on GitHub, closed Linear tickets, deliverables accepted by the client's PM, usage reports, delivery confirmations. |
| Bill     | What the contractor charges, read from a PDF, an e-mail or a chat by a language model.                                                        |

## The evidence rule

Each contract says what proves that its kind of work was delivered:

| Contract type | Evidence that proves delivery                              | Example in the dataset                     |
| ------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Hourly        | Hours logged in the period (merged PRs shown as support)   | Daniela Ospina, Julián Restrepo            |
| Milestone     | The named PR merged, ticket closed or deliverable accepted | Andrés Villaseñor (PRs), Estudio Ceiba     |
| Retainer      | The signed schedule itself                                 | Cardumen Digital, Trazo Cloud              |
| Usage         | The usage report for the period                            | Palabra Viva (words), Faro Hosting (meter) |
| Goods         | The delivery confirmation                                  | Mantenimientos Guadua                      |

## Five outcomes

| Outcome    | When                                                                                                | Next step                                                  |
| ---------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| PAY        | Everything billed is evidenced and within the contract.                                             | Payment planned on the right rail and date.                |
| PAY PART   | Part is evidenced and the contract allows partial payment.                                          | The proven part is paid; the vendor is asked for the rest. |
| ASK VENDOR | Evidence missing or the bill does not add up.                                                       | A message to the vendor; its reply re-runs the decision.   |
| ESCALATE   | Outside the rules: no contract, over the cap or limit, new payout, low confidence, deadline missed. | A person approves or rejects, with the exact reason.       |
| HOLD       | A duplicate of a bill or of work already billed.                                                    | Nothing is paid.                                           |

## What makes it work

1. **The model reads; code decides.** The model extracts fields and maps lines to contract terms;
   18 deterministic checks decide ([RULES.md](../RULES.md)).
2. **The vendor first.** A signed portal link per case; a corrected bill continues the case and
   never pays twice; payout details can never change through it.
3. **Blinka's rails.** COP → Bre-B, MXN → SPEI, BRL → Pix, USD → ACH; pay on the due date to keep
   yield unless the discount is worth more.
4. **Reconciliation to the evidence.** Bank line ↔ payment ↔ bill ↔ contract ↔ evidence.
5. **A receipt per decision.** The outcome stamp, the proof bar, the reason in Spanish, every
   check, every evidence link, the reading with its confidence, and what would have to be true to
   pay it.

## What it is not

Not a payment processor (no money moves), not KYC, not fraud scoring, not tax compliance. It
replaces the Slack question "¿esto sí se entregó?" with evidence, and the approval on trust with a
receipt.

Next: [03 · Personas and journeys](03-personas-and-journeys.md).
