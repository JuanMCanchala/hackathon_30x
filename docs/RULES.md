# Rules catalog

Every bill is evaluated against **all** rules below, in this order. Each rule returns `pass`,
`fail` or `skip` and, on failure, triggers `HOLD` or `ESCALATE`. Aggregation is deny-by-default
([ADR-0003](adr/0003-three-outcomes-deny-by-default.md)): `PAY` only when every rule passes or
safely skips.

Spanish titles are what users see in receipts. Thresholds come from the **policy version** in
force; mandate parameters from the **mandate version** that covers the payee.

## A · Reading (`reading.*`, `dates.*`)

| ID                              | Título (UI)                      | Fails when                                                                                  | On fail    | Safe skip                    |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- | ---------- | ---------------------------- |
| `reading.document_type`         | Es una cuenta por pagar          | The document is not an invoice or _cuenta de cobro_ (credit note, receipt, unrelated).      | `ESCALATE` | —                            |
| `reading.required_fields`       | Datos completos                  | Missing payee identity, total, currency, invoice number or issue date.                      | `ESCALATE` | —                            |
| `reading.confidence`            | Lectura confiable                | A critical field's confidence is below `minExtractionConfidence`.                           | `ESCALATE` | —                            |
| `reading.arithmetic`            | Los números cuadran              | Σ line items + taxes − withholdings ≠ total.                                                | `ESCALATE` | No line items                |
| `reading.amount_in_words`       | Monto en letras coincide         | The amount written in words differs from the amount in figures.                             | `ESCALATE` | No amount in words           |
| `reading.addressed_to_us`       | Dirigida a la empresa            | The bill is addressed to a different company.                                               | `ESCALATE` | No addressee on the document |
| `reading.no_agent_instructions` | Sin instrucciones para el agente | Text addressed to an automated system/AI was detected (LLM flag **or** deterministic scan). | `ESCALATE` | —                            |
| `dates.valid`                   | Fechas válidas                   | Issue date in the future, older than `maxInvoiceAgeDays`, or due date before issue date.    | `ESCALATE` | —                            |

## B · Payee (`payee.*`)

| ID                          | Título (UI)                | Fails when                                                                                                                                                                      | On fail    |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `payee.known`               | Beneficiario registrado    | No registered payee matches the tax ID or the exact payout destination, or they point to different payees. Names never resolve a payee; a similar name is only shown as a hint. | `ESCALATE` |
| `payee.active`              | Beneficiario habilitado    | The payee is blocked.                                                                                                                                                           | `HOLD`     |
| `payee.destination_matches` | Destino de pago registrado | The bill's payout details differ from the registered ones. (No payout details → the registered destination is used.)                                                            | `ESCALATE` |

## C · Duplicates (`duplicate.*`)

| ID                             | Título (UI)        | Fails when                                                                                                                          | On fail    |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `duplicate.invoice_number`     | No está duplicada  | Same payee and same normalized invoice number as a bill already paid, approved or pending approval.                                 | `HOLD`     |
| `duplicate.same_amount_recent` | Sin cobro repetido | Same payee, amount and currency, different number, and same service period (or issued within `duplicateWindowDays` when no period). | `ESCALATE` |

## D · Mandate (`mandate.*`)

| ID                   | Título (UI)              | Fails when                                                                   | On fail    |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------- | ---------- |
| `mandate.exists`     | Hay un acuerdo firmado   | No active, in-validity mandate for the payee.                                | `ESCALATE` |
| `mandate.currency`   | Moneda acordada          | The bill's currency differs from the mandate's.                              | `ESCALATE` |
| `mandate.amount`     | Monto acordado           | Fixed mandate: outside amount ± tolerance. Up-to mandate: above the maximum. | `ESCALATE` |
| `mandate.frequency`  | Frecuencia acordada      | This bill would exceed `maxInvoicesPerPeriod` for the calendar month.        | `ESCALATE` |
| `mandate.period_cap` | Tope mensual del acuerdo | Paid + approved + pending this month + this bill > `periodCap`.              | `ESCALATE` |

## E · Global policy and treasury (`policy.*`, `treasury.*`)

| ID                        | Título (UI)         | Fails when                                                                                              | On fail    |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| `policy.currency_allowed` | Moneda permitida    | Currency not in `allowedCurrencies`.                                                                    | `ESCALATE` |
| `policy.autonomous_limit` | Límite por pago     | USD amount (ceil) > `autonomousLimitUsd`, unless the mandate carries a signed exception that covers it. | `ESCALATE` |
| `policy.period_budget`    | Presupuesto del mes | Committed this month + this bill > `monthlyBudgetUsd`.                                                  | `ESCALATE` |
| `treasury.balance`        | Saldo disponible    | Available treasury balance < this bill (USD).                                                           | `HOLD`     |

## F · Requester (`requester.*`)

| ID                | Título (UI)            | Fails when                                                                                       | On fail | Safe skip                      |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------ | ------- | ------------------------------ |
| `requester.scope` | Solicitante autorizado | An external agent requested a payment outside its scope (payee category or max USD per request). | `HOLD`  | Bill not requested by an agent |

## Approvals

- `ESCALATE` creates an approval request requiring **1** approver, or **2 distinct** approvers when
  the USD amount exceeds `dualApprovalAboveUsd`.
- An approved bill counts toward the month's committed spend.

## Teachable rules → proposals

When a person **approves** an escalated bill and **every** failing rule is teachable, the agent
proposes a mandate change. Any non-teachable failure (destination, duplicates, reading, dates,
currency allowed, budget, balance, blocked payee, requester) means no proposal.

| Failing rule              | Proposal                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `payee.known`             | Register the payee with the bill's details **and** a mandate for that amount. |
| `mandate.exists`          | Create a mandate for that payee and amount.                                   |
| `mandate.amount`          | Update the mandate's agreed amount.                                           |
| `mandate.frequency`       | Raise the invoices-per-month limit.                                           |
| `mandate.period_cap`      | Raise the monthly cap.                                                        |
| `policy.autonomous_limit` | Add a signed exception to the mandate up to that amount.                      |

Every proposal shows its **maximum monthly exposure** in USD and the past escalations it would have
avoided. It takes effect only when a user with signing rights accepts it.
