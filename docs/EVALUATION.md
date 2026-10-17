# Evaluation

Recibido pays a services bill only for the work it can prove was delivered. The evaluation
measures that claim on the labeled [dataset](../packages/dataset) of Altamar Labs Inc.: 45 bills
over September and October 2026 (41 cases plus 4 corrected bills sent through the vendor portal),
each labeled with its expected first decision, the status its case ends in, and who resolves it.
It runs the real application services, not a mock, and CI fails when it slips.

```bash
pnpm eval                # both runs; writes .eval/report.json and .eval/report.md (every bill)
pnpm eval --write-docs   # also refreshes the results section below
```

## What a run does

1. Opens an in-memory PostgreSQL (PGlite), seeds Altamar Labs and sets the simulated clock to
   September 1.
2. Runs every step of `SCRIPT.septiembre` and `SCRIPT.octubre` (bills arriving as PDFs, e-mails
   and chats, vendor replies through the portal, evidence arriving, a person's decisions, the
   clock moving to execute payments and expire vendor deadlines) through `runStep`, the same step
   runner the guided demo uses, so the demo cannot drift from what is measured.
3. Compares every bill with its labels and re-checks every payment with the independent checker
   (`checkInvariants`, which shares no code with the engine).

It runs twice:

| Run       | Reading and line matching                                                                 | Question it answers                                      |
| --------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Reference | The dataset's ground truth                                                                | Are the rules, the vendor loop and the payments right?   |
| Replay    | The real model's recorded answers (DeepSeek V4.1 Flash on OpenRouter, `packages/dataset/recordings`) | Does the whole agent decide right, misreadings included? |

The eval never calls a model and needs no key: it builds its configuration with
`LLM_PROVIDER=none` and replays the recordings. If a recording is missing (a prompt changed
without re-recording), the replay run is skipped with a notice naming the bills.

## Gates (CI fails otherwise, in either run)

| Gate                         | Threshold                                                         |
| ---------------------------- | ----------------------------------------------------------------- |
| Improper payments            | **0** payments with any checker violation                         |
| Independent checker          | **0** violations                                                  |
| Final-status accuracy        | **≥ 95 %** of bills end in their labeled status                   |
| Script steps (reference run) | every step accepted by the services (with perfect reading, a refused step is a bug) |

## How to read the numbers

- **Decided correctly without a person** counts cases that end in their labeled status as PAID,
  PART_PAID or HELD with no human action. A case the agent sent back to the vendor counts once the
  vendor closes the gap (a corrected bill after an ASK VENDOR, or the missing evidence for the rest
  of a PAY PART), and is also shown as **resolved by the vendor**; the report checks it against
  each bill's `resolvedBy` label. The **ceiling** is
  the share of cases whose labels do not need a person: some bills must reach one (a changed bank
  account, an unknown company, extra hours outside the contract, a vendor who missed the deadline),
  so the ceiling is below 100 % by design.
- **Baseline**: today 100 % of Altamar's services bills go to a person, because nobody can prove
  delivery without one.
- **Evidence coverage** is the share of the billed USD value of the cases that the evidence
  (merged PRs, time entries, accepted deliverables, closed tickets, usage reports, deliveries)
  proves.
- **Yield kept** and **fees saved** come from the payment plan of each payment: paying on the due
  date keeps the money in the fund (4.0 % a year, simulated) and local rails (Bre-B, SPEI, Pix,
  ACH) instead of an international wire save the wire's fee and spread. Assumptions are in
  `packages/domain/src/payments.ts`.
- **Median hours bill → payment** is simulated time from a bill's arrival to its payment
  (executed, else scheduled). It is about 15 days on purpose: Recibido pays on the due date to
  keep the yield, unless an early-payment discount is worth more.
- **Critical fields read correctly** (replay only) compares the model's reading of every document
  with the truth on 11 fields: vendor tax id, invoice number, issue date, due date, period,
  currency, total, lines (count, unit, quantity and amount of each), payout details (the same
  account or key), the invoice it corrects, and whether it addresses an automated system.

## Results

<!-- eval:start -->

Baseline: today **100 %** of Altamar Labs’ services bills go to a person (nobody can prove delivery without one).

### Reference run (ground-truth reading and matching)

| Month | Bills | First decision correct | Final status correct | Cases | Decided correctly without a person | of which the vendor resolved | Went to a person | Held | Improper payments | Evidence coverage | Yield kept | Fees saved | Median hours bill → payment |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| septiembre | 23 | 23 (100.0 %) | 23 (100.0 %) | 22 | 21 (95.5 %; ceiling 95.5 %) | 3 | 1 | 2 | 0 | 100.0 % | USD 73.92 | USD 1,688.34 | 360 |
| octubre | 22 | 22 (100.0 %) | 22 (100.0 %) | 19 | 12 (63.2 %; ceiling 63.2 %) | 6 | 7 | 1 | 0 | 97.7 % | USD 45.62 | USD 1,704.54 | 354.3 |
| **Total** | 45 | 45 (100.0 %) | 45 (100.0 %) | 41 | 33 (80.5 %; ceiling 80.5 %) | 9 | 8 | 3 | 0 | 98.7 % | USD 119.54 | USD 3,392.88 | 358 |

| Gate | Result |
| --- | --- |
| Zero improper payments | pass · 0 improper payments |
| Independent checker: no violations | pass · 0 violations |
| Final status correct ≥ 95 % | pass · 45/45 (100.0 %) |
| Every script step accepted | pass · 0 steps refused |

Every bill matches its labels.

### Replay run (recorded readings and matches of the real model)

| Month | Bills | First decision correct | Final status correct | Cases | Decided correctly without a person | of which the vendor resolved | Went to a person | Held | Improper payments | Evidence coverage | Yield kept | Fees saved | Median hours bill → payment | Critical fields read correctly |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| septiembre | 23 | 23 (100.0 %) | 23 (100.0 %) | 22 | 21 (95.5 %; ceiling 95.5 %) | 3 | 1 | 2 | 0 | 100.0 % | USD 73.92 | USD 1,688.34 | 360 | 245/253 (96.8 %) |
| octubre | 22 | 22 (100.0 %) | 22 (100.0 %) | 19 | 12 (63.2 %; ceiling 63.2 %) | 6 | 7 | 1 | 0 | 97.6 % | USD 45.62 | USD 1,704.54 | 354.3 | 235/242 (97.1 %) |
| **Total** | 45 | 45 (100.0 %) | 45 (100.0 %) | 41 | 33 (80.5 %; ceiling 80.5 %) | 9 | 8 | 3 | 0 | 98.7 % | USD 119.54 | USD 3,392.88 | 358 | 480/495 (97.0 %) |

| Gate | Result |
| --- | --- |
| Zero improper payments | pass · 0 improper payments |
| Independent checker: no violations | pass · 0 violations |
| Final status correct ≥ 95 % | pass · 45/45 (100.0 %) |

Bills that differ from their labels:

| Bill | Expected first → final | Got first → final | Resolved by | Reading differences |
| --- | --- | --- | --- | --- |
| `sep-09` | ASK_VENDOR → PAID | ASK_VENDOR → PAID | vendor (label: vendor) | lines: expected 80 hour × 1200000, read 80 unit × 1200000 |
| `sep-09-r1` | PAY → PAID | PAY → PAID | vendor (label: vendor) | lines: expected 80 hour × 1200000, read 80 unit × 1200000 |
| `sep-14` | ASK_VENDOR → PAID | ASK_VENDOR → PAID | vendor (label: vendor) | lines: expected 1 milestone × 5800000, read 1 unit × 5800000 |
| `sep-15` | PAY → PAID | PAY → PAID | agent (label: agent) | lines: expected 1 milestone × 960000, read 1 unit × 960000 |
| `sep-18` | PAY → PAID | PAY → PAID | agent (label: agent) | lines: expected 1 milestone × 3400000, read 1 unit × 3400000 |
| `sep-20` | PAY → PAID | PAY → PAID | agent (label: agent) | lines: expected 1 milestone × 270000, read 1 unit × 270000 |
| `sep-21` | PAY → PAID | PAY → PAID | agent (label: agent) | period: expected null..null, read 2026-09-01..2026-09-30; lines: expected 1 milestone × 620000000, read 1 unit × 620000000 |
| `oct-11` | ESCALATE → APPROVED | ESCALATE → APPROVED | person (label: person) | lines: expected 172 hour × 8944000, read 172 unit × 8944000 |
| `oct-12` | ASK_VENDOR → PAID | ASK_VENDOR → PAID | vendor (label: vendor) | lines: expected 96 hour × 1584000, read 96 unit × 1584000 |
| `oct-13` | ESCALATE → REJECTED | ESCALATE → REJECTED | person (label: person) | period: expected null..null, read 2026-09-01..2026-09-30 |
| `oct-19` | ESCALATE → ESCALATED | ESCALATE → ESCALATED | person (label: person) | currency: expected COP, read null; total: expected 120000000, read 120000; lines: expected - unit × 120000000, read - other × 120000; payoutDetails: expected null, read lacuentaformalselamandodespus |

### Model usage (recordings)

Recorded with openrouter · deepseek/deepseek-v4.1-flash: 45 readings and 38 line matchings for 45 bills.

| Input tokens | of which cache hits | Output tokens | Cost | Cost without cache | Mean per bill (input / output / cost) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 84,453 | 31,872 | 52,698 | USD 0.0396 | USD 0.0443 | 1877 / 1171 / USD 0.00088 |

Prices: DeepSeek V4.1 Flash, USD 0.15 per million input tokens (cache miss), 0.003 per million cached input tokens, 0.60 per million output tokens.

<!-- eval:end -->

## What the replay run taught us

- The first recording of the line matcher (`matcher-1`) scored Beatriz Lima's research hours at
  0.62 confidence: her faturas print a bare quantity ("80", "96") with no unit, the reader guessed
  `unit`, and the matcher distrusted an hours term for a line in units. `sep-09` then escalated to
  a person instead of asking her for the missing period, her corrected fatura had no case to land
  in, and October's `oct-12` was held as a possible duplicate of the still-open August work. The
  replay run ended at **41/45 (91.1 %)** and failed the gate. The truth labels were not touched.
- The fix is in the matcher prompt (`matcher-2`): match on what the line describes; the unit is
  the reader's guess and does not lower the confidence by itself. This is safe because the model
  never sees prices or evidence: code still checks the billed hours against time entries and the
  rate against the contract. All 38 matchings were re-recorded.
- Readings that still differ from the truth, and why the decisions are still right:
  - Several lines are read with unit `unit` where the truth says `hour` or `milestone` (the
    documents do not print a unit); the matcher now maps them correctly.
  - `sep-21` and `oct-13` are read with a September period the truth leaves empty (the bills
    mention the month in a description); neither decision depends on it.
  - `oct-19` (a WhatsApp chat that says "1.200" with no currency and promises the formal bill
    later) is read with currency null and a total of 1,200.00: the bill escalates, as labeled.

## Recording

```bash
LLM_PROVIDER=openrouter wallenv run -- pnpm record   # or deepseek; sequential by default
RECORD_CONCURRENCY=3 ...                             # parallel requests
```

`pnpm record` reads every dataset document with the live model, then matches its lines against
the contract the services would pick, and writes the answers to `packages/dataset/recordings`.
Answers already recorded for the current `READER_VERSION` / `MATCHER_VERSION` replay and cost
nothing; bumping a version after a prompt change makes them stale. It prints each reading's
differences from the truth and the tokens it spent.
