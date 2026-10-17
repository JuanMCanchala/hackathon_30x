# Rules

Recibido decides with 18 checks, in the order below, in
[`packages/domain/src/checks.ts`](../packages/domain/src/checks.ts). Each one returns `pass`,
`fail` or `not_run`, a Spanish detail and, when it fails, a remedy: what would have to be true to
pay. The engine ([`engine.ts`](../packages/domain/src/engine.ts)) takes the most severe outcome
among the failures:

`PAY` < `PAY_PART` < `ASK_VENDOR` < `ESCALATE` < `HOLD`

A check that could not run counts as `ESCALATE`. Some failures **block** the checks after them
(there is nothing to compare without a reading, a vendor, a contract or a line match): those
become `not_run`. Only a clean sweep pays ([ADR-0003](adr/0003-five-outcomes-deny-by-default.md)).

## The checks

| #   | Check                  | Stage     | Spanish label                     | On fail                          | Passes when                                                                                                         |
| --- | ---------------------- | --------- | --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `reading.available`    | lectura   | Lectura de la cuenta              | ESCALATE (blocks)                | The reader returned a valid reading of the document.                                                                |
| 2   | `reading.confidence`   | lectura   | Confianza de la lectura           | ESCALATE                         | Vendor, invoice number, total, lines, currency and dates were each read with confidence ≥ 0.85.                     |
| 3   | `reading.instructions` | lectura   | Instrucciones dirigidas al agente | ESCALATE                         | Neither the reader nor the deterministic scanner finds text addressed to an automated system.                       |
| 4   | `reading.arithmetic`   | lectura   | Cuentas que cuadran               | ASK_VENDOR                       | Every line has an amount, quantity × unit price equals the amount (± 1 minor unit), and the lines sum to the total. |
| 5   | `reading.period`       | lectura   | Período facturado                 | ASK_VENDOR                       | Hourly, retainer and usage bills state a valid period (from ≤ to); milestone and goods bills need none.             |
| 6   | `vendor.registered`    | proveedor | Proveedor registrado              | ESCALATE (blocks)                | Exactly one registered vendor has the bill's normalized tax id. Names never resolve a vendor.                       |
| 7   | `vendor.payout`        | proveedor | Destino del pago                  | ESCALATE                         | No account, key or e-mail other than the registered destination appears, and nothing asks to change payout details. |
| 8   | `contract.active`      | contrato  | Contrato vigente                  | ESCALATE (blocks)                | Exactly one contract of the vendor is valid on the issue date.                                                      |
| 9   | `contract.currency`    | contrato  | Moneda del contrato               | ESCALATE (blocks)                | The bill's currency is the contract's.                                                                              |
| 10  | `duplicate.invoice`    | duplicado | Cuenta ya recibida                | HOLD                             | No other bill of the vendor (outside this case) has the same normalized invoice number.                             |
| 11  | `duplicate.work`       | duplicado | Trabajo ya facturado              | HOLD                             | No other claiming bill of the contract covers an overlapping period (hours, retainer, usage) or the same milestone. |
| 12  | `match.confidence`     | evidencia | Cruce de líneas con el contrato   | ESCALATE (blocks if no match)    | Every line was mapped to a contract term with confidence ≥ 0.80.                                                    |
| 13  | `terms.lines`          | contrato  | Conceptos del contrato            | ASK_VENDOR                       | Every line maps to a term of the contract, and no term is billed on two lines.                                      |
| 14  | `terms.price`          | contrato  | Tarifa del contrato               | ASK_VENDOR                       | No line charges more than the term's rate (per hour, per unit, or the fixed milestone or retainer amount).          |
| 15  | `terms.cap`            | contrato  | Tope mensual                      | ESCALATE                         | What the contract already paid that month plus this bill's evidenced amount stays within the monthly cap.           |
| 16  | `policy.limit`         | contrato  | Límite de pago automático         | ESCALATE                         | What would be paid now, converted to USD, is ≤ USD 20,000 (the organization's auto-pay limit).                      |
| 17  | `evidence.coverage`    | evidencia | Evidencia de entrega              | PAY_PART or ASK_VENDOR (dynamic) | Everything billed is evidenced, or the contract does not require evidence for it.                                   |
| 18  | `vendor.deadline`      | plazo     | Plazo del proveedor               | ESCALATE                         | No ask is pending, the vendor already resolved it, or it is still within the contract's `vendorResponseDays`.       |

## Details that matter

- **Deny by default on missing data.** A previous bill without a readable period counts as
  overlapping (`duplicate.work`) and as paid in this month (`terms.cap`). An unusable FX rate fails
  `policy.limit`. An impossible date (`2026-02-30`) is not a date.
- **`reading.instructions`** combines the reader's `instructionsToAgent` flag with
  `scanInstructions` over the raw document text, the payout details and every line description
  ([`scan.ts`](../packages/domain/src/scan.ts)). The model's flag alone is not trusted to be the
  only defense.
- **`vendor.payout`** scans the document text, the reading's payout details and the line
  descriptions for bank accounts, CLABEs, Pix and Bre-B keys, IBANs, e-mails and phone-like keys
  near a payout word, ignoring the vendor's own tax id, the buyer's tax ids and the bill's own
  amounts. Any candidate that differs from the registered destination, or any payout-change
  wording ("cambiamos de banco", "nova chave Pix"), fails. A vendor's portal message is part of
  this text, so the vendor loop cannot change the payout
  ([ADR-0005](adr/0005-vendor-first-loop-and-payout-lock.md)).
- **`evidence.coverage`** fails with `PAY_PART` when the contract has `allowPartial` and some
  evidence exists, otherwise `ASK_VENDOR`. If the case already paid more than the bill now charges,
  it escalates (refund or credit note). The evidence math, per term kind, is in
  [`evidence.ts`](../packages/domain/src/evidence.ts):

  | Term kind | Evidence that counts                                             | Evidenced amount                                     |
  | --------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
  | hours     | Toggl `time_entry` items of the term's project inside the period | min(billed hours, logged hours) × billed rate        |
  | milestone | the named PR merged, ticket closed or deliverable accepted       | the line's amount, or 0                              |
  | retainer  | none required (the signed schedule)                              | the line's amount                                    |
  | usage     | the meter's `usage_report` for the period                        | min(billed quantity, reported quantity) × unit price |
  | goods     | the order's `delivery_confirmed`                                 | the line's amount, or 0                              |

  Merged PRs behind an hourly contract are listed as supporting evidence; they do not add hours.

- **`vendor.deadline`** starts counting when the agent first asks; a revision keeps the original
  `askedAt`, so a vendor cannot reset the clock by answering with something incomplete.
- **What is paid.** `PAY` pays what is billed minus what the case already paid; `PAY_PART` pays
  what is evidenced minus what the case already paid, and asks for the rest.

## After the decision

| Outcome      | What happens                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `PAY`        | A payment is planned (rail and date, [`payments.ts`](../packages/domain/src/payments.ts)) to the registered destination. |
| `PAY_PART`   | The evidenced part is planned and the vendor gets a message about the rest.                                              |
| `ASK_VENDOR` | The vendor gets a message with the gap and a portal link; any reply or new evidence re-decides the bill.                 |
| `ESCALATE`   | A person approves (pays what the case still owes, only to the registered destination) or rejects.                        |
| `HOLD`       | Nothing is paid; the receipt names the bill it duplicates.                                                               |

A person cannot approve a bill whose amount or currency the reader did not read with certainty
(`oct-19`, the WhatsApp "1.200"): the API answers 409 and asks for the formal bill
([`humans.ts`](../apps/api/src/services/humans.ts)).

## Thresholds

| Setting                                                                            | Value        | Where                                                           |
| ---------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `minReadingConfidence`                                                             | 0.85         | `DEFAULT_POLICY`, [`types.ts`](../packages/domain/src/types.ts) |
| `minMatchConfidence`                                                               | 0.80         | `DEFAULT_POLICY`                                                |
| `autoPayLimitUsdMinor`                                                             | USD 20,000   | `DEFAULT_POLICY`                                                |
| Monthly cap, net days, early-payment discount, partial payments, vendor reply days | per contract | [`contracts.ts`](../packages/dataset/src/contracts.ts)          |

A property test asserts that tightening `minReadingConfidence` or the auto-pay limit never turns
a non-PAY into PAY ([`properties.test.ts`](../packages/domain/test/properties.test.ts)).
