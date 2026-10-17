# 04 · Success metrics

Blinka judges **autonomy** (bills decided correctly without a person), **safety** (zero payments
outside the rules) and **explainability** (anyone understands each decision from its log). Each
metric below is measured by `pnpm eval` over the labeled dataset ([EVALUATION.md](../EVALUATION.md)),
except where noted.

| Metric                                  | Definition                                                                                            | Target              | Measured (replay run, both months) |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------- |
| Improper payments                       | Payments with any checker violation                                                                   | **0** (CI gate)     | **0**                              |
| Independent checker violations          | I1–I7 re-derived over every payment                                                                   | 0 (CI gate)         | 0                                  |
| Final status correct                    | Bills whose case ends in its labeled status                                                           | ≥ 95 % (CI gate)    | 45/45 (100.0 %)                    |
| Decided correctly without a person      | Cases ending in their labeled PAID / PART_PAID / HELD status with no human action                     | the label ceiling   | 33/41 (80.5 %; ceiling 80.5 %)     |
| … closed after a vendor reply           | Part of the above, closed by a message or a corrected bill                                            | —                   | 5                                  |
| … closed by new evidence after an ask   | Part of the above, closed by a merge, an acceptance or synced hours                                   | —                   | 4                                  |
| Evidence coverage                       | Share of the billed USD value the evidence proves                                                     | —                   | 98.7 %                             |
| Critical fields read correctly          | The model's reading vs. the truth on 11 fields                                                        | —                   | 480/495 (97.0 %)                   |
| Yield kept / fees saved                 | From each payment's plan (simulated fund and rails)                                                   | —                   | USD 119.54 / USD 3,392.88          |
| Median hours bill → payment             | Simulated time from arrival to payment                                                                | due date, by design | 358                                |
| Model cost per bill                     | From the recordings' token usage                                                                      | < USD 0.001         | USD 0.00088                        |
| Explainability (not scored by the eval) | Every decision has a receipt with the reason, every check, evidence links, reading and counterfactual | every decision      | every decision                     |

**Baseline.** Today 100 % of Altamar's services bills go to a person.

**Why the ceiling is not 100 %.** Some bills must reach a person by design: a changed payout, an
unregistered company, hours over the cap, an amount over the auto-pay limit, hidden instructions,
an ambiguous amount, a vendor who missed the deadline. Raising autonomy past the ceiling would mean
paying one of those.

## For a pilot with Blinka

- Share of a customer's services bills decided without a person, month over month.
- Hours of finance time saved (bills × minutes per manual review).
- Cases closed by the vendor without the team.
- Yield kept and wire fees avoided, measured on Blinka's real rails.
- Improper payments: zero, checked by the independent checker on every payment.

Next: [05 · Prior art](05-prior-art.md).
