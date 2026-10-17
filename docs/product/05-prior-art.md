# 05 · Prior art: what exists, and what Recibido adds

## What already exists

| Category                                     | What it does                                                                                  | What it leaves open for services                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Three-way match** (ERP and AP practice)    | Matches purchase order, goods-received note and invoice before paying goods.                  | There is no goods-received note for services.                                         |
| **AP automation suites**                     | Capture invoices (OCR or a model), route approvals, pay, sync to accounting.                  | Approval routing still asks a person whether the work was done.                       |
| **Contractor payment platforms**             | Contracts, invoices and payouts for international contractors.                                | Pay what the contractor submits; delivery is confirmed by a person.                   |
| **Time trackers, issue trackers, Git hosts** | Record hours, tickets and merged code.                                                        | They hold the evidence, but nothing joins it to the bill and the payment.             |
| **AI agents for AP**                         | A model reads invoices and suggests or takes actions.                                         | A model in the decision is hard to audit, and can be steered by text in the document. |
| **Mandato** (our team, same challenge)       | Pays what a person signed in a standing mandate, with receipts, an attack lab and an auditor. | Answers "is this authorized?", not "was this delivered?" (see below).                 |

## Patterns we keep

- **Deterministic rules, not a model judging a model.** The decision is code; the model reads.
- **Confidence routing.** Low-confidence readings and matches go to a person.
- **The destination must not change.** Only the registered payout is ever paid.
- **A receipt per decision and an independent checker**, as in Mandato.
- **The jury can walk it alone.** One-click reset, guided tour, recorded model answers.

## What Recibido adds

1. **A three-way match for services**, from digital evidence, line by line, with a structural link
   from each contract term to its evidence.
2. **Partial payments.** Pay the proven part now; ask for the rest.
3. **The vendor loop.** Most AP exceptions are data the vendor can fix; Recibido asks the vendor
   first, through a signed link, and only then a person, without ever letting the vendor change the
   payout.
4. **Blinka-specific treasury.** Local rails (Bre-B, SPEI, Pix, ACH) instead of a wire, and
   due-date timing that keeps money-market yield unless the early-payment discount is worth more.
5. **Reconciliation to the evidence.** The bank line links back through payment, bill and
   contract to the PR, the hours or the acceptance that justified it.

## Recibido and Mandato

| Question             | Mandato                                             | Recibido                                             |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Core question        | Is this payment authorized by what a person signed? | Was the work being charged actually delivered?       |
| What raises autonomy | People sign standing agreements over time           | Evidence proves delivery; vendors fix their own gaps |
| Partial payments     | No                                                  | Pays the evidenced part                              |
| Reconciliation       | Ledger and CSV export                               | Bank line ↔ payment ↔ bill ↔ contract ↔ evidence, FX |
| Blinka-specific      | Generic AP                                          | Local rails and yield-aware timing                   |

The two share a stack and engineering patterns (record/replay, eval as a CI gate, receipts, a
guided demo) so the team can maintain either.
