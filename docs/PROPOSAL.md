# Recibido — no payment without proof it was delivered

> **Ningún pago sin prueba de entrega.** An accounts-payable agent that pays a services bill only
> for the work it can prove was delivered, asks the contractor for what is missing before it
> bothers the team, and reconciles every payment against the contract, the evidence and the bank.

Status: proposal selected on 2026-10-17 for the 30X Hackathon, **Blinka challenge**. It competes
inside the team with Mandato (branch `feat/mandato`); the team picks one project to submit. This
document is the approved design. A builder should be able to plan and build from it alone.

## 1. The challenge

**Blinka — "Agentes que pagan por la empresa".** Build an agent that reviews a company's bills,
decides which ones to pay on its behalf within the rules the company defines, reconciles them,
and asks a person for permission when something falls outside those rules. No real money moves.

Blinka judges three things:

| Criterion      | What the judge looks at                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| Autonomy       | Share of bills the agent decides **correctly** without a person.                     |
| Safety         | **Zero** payments outside the rules. One improper payment disqualifies.              |
| Explainability | Anyone understands why each bill was paid, held or escalated by reading the log.     |

Out of scope per the brief: moving real money, opening accounts, verifying company identity,
compliance and fraud decisions, designing Blinka's app.

Hackathon rubric: impact on the challenge 30 %, innovation 20 %, technical viability 20 %,
implementation viability (could Blinka adopt it with its real constraints) 20 %, presentation 10 %.
The judge is Blinka's technical co-founder.

Deliverables (deadline Sunday 2026-10-18, 12:00 Colombia, no extensions): 3-minute pitch video
with the demo working, deployed demo URL, public GitHub repo, README with architecture, how to
run it, security measures and **estimated monthly operating and inference cost**. Disqualifies:
demo that does not match the repo, secrets in the code, late delivery.

## 2. Who Blinka is (researched 2026-10-17)

- YC Fall 2026, founded 2024 by the Colombian brothers Juan Pablo (CEO) and Sebastián Linares
  (engineer; called CTO or CPO depending on the outlet). About 7 people.
- USD business accounts for US-registered companies with owners, teams or customers abroad,
  mostly in Latin America. Each legal entity gets its own account, all in one portal (one
  real-estate customer manages more than 200 entities).
- ACH and wire, plus local payouts in COP, MXN and BRL over **Bre-B, SPEI and Pix**; 20+
  currencies. Treasury with yield through money-market funds. Visa corporate cards.
- Before banking they built AI for US mortgage origination and agents that replaced commercial
  real-estate loan brokers: document-heavy work where everything is about verifying evidence.
- Reported customers include startups with LatAm teams (Dapta, Treinta, Creditop) and real-estate
  companies (Bricksave, Brikser).

Sources: valoraanalitik.com/?p=616519, portafolio.co (Blinka YC article), larepublica.co
(Blinka US$10M article), latamfintech.co (Blinka YC article).

## 3. The problem

Accounting already has a control for goods: the **three-way match**. Before paying, AP checks
the purchase order, the goods-received note and the invoice. For services there is no
goods-received note. Nobody in finance can tell whether the contractor really worked 160 hours,
whether the agency delivered the designs, or whether the milestone was done. So every services
bill goes to a person, who asks the project lead on Slack, waits, and approves on trust.

For Blinka's customers services are the bulk of what they pay: developers, designers, agencies,
property maintenance, all in several countries and currencies. That is exactly where an agent
that "pays bills" stalls today, and where a wrong payment is invisible because nobody checks.

## 4. The idea

Recibido builds the missing goods-received note for services out of **digital evidence** and
runs a three-way match on every services bill:

1. **Contract**: rate, cap, currency, payee, payment terms and the **evidence rule** (what proves
   that this kind of work was delivered).
2. **Evidence**: merged pull requests and commits (GitHub), closed tickets (Linear/Jira), logged
   hours (Toggl/Clockify), accepted deliverables, delivery confirmations.
3. **Bill**: what the contractor is charging, read from PDF, e-mail or chat.

Evidence rules by contract type:

| Contract type        | Evidence that proves delivery                                        |
| -------------------- | -------------------------------------------------------------------- |
| Hourly               | Logged hours for the period, optionally backed by commits or tickets |
| Milestone / project  | Milestone accepted: PR merged, ticket closed or deliverable approved |
| Retainer / recurring | The signed schedule itself (evidence not required by contract)       |
| Usage-based          | Usage report for the period                                          |
| Goods                | Delivery confirmation                                                |

### Outcomes

| Outcome         | When                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **PAY**         | Everything billed is evidenced and within the contract.                                                |
| **PAY PART**    | Part of the bill is evidenced. If the contract policy allows it, pay the evidenced part now and send the rest to ASK VENDOR. |
| **ASK VENDOR**  | Evidence is missing or does not match. The agent writes to the contractor asking for the missing evidence or a corrected bill. A reply re-runs the evaluation. |
| **ESCALATE**    | Outside the rules: no contract, over the cap, new or changed payout destination, low-confidence reading or matching, vendor did not resolve in time. A person decides, with the exact reason. |
| **HOLD**        | Duplicate of a bill already paid.                                                                      |

The **ASK VENDOR** loop is the second differentiator: most escalations in AP are data problems
the vendor can fix. Recibido tries the vendor first and only reaches a person when the vendor
cannot resolve it. The vendor can never change payout details through this channel; any such
request escalates.

### Example decisions (the demo should contain these)

- SaaS subscription billed on schedule: **PAY**, evidence rule says the schedule is enough.
- Developer billing 120 h with 120 h logged and 9 merged PRs: **PAY**.
- Developer billing 160 h with 92 h logged: **PAY PART** for 92 h, **ASK VENDOR** for 68 h
  ("Facturaste 160 h y hay registro de 92 h. ¿Puedes adjuntar el resto o corregir la cuenta?").
  The contractor replies with a corrected bill and the case closes without a person.
- Design agency milestone "Brand kit v2" with no accepted deliverable: **ASK VENDOR**, then the
  client PM accepts the deliverable and the bill is paid.
- Milestone tied to a PR that is still open: held as ASK VENDOR; **live in the demo, the PR is
  merged on GitHub and the bill pays itself within seconds**, with the receipt citing that PR.
- Bill with a new bank account in the e-mail body: **ESCALATE** (destination differs from the
  registered one).
- Same bill forwarded twice: **HOLD**.

### The Blinka touch: when and how to pay

For every payment Recibido also decides **when** and **through which rail**, deterministically:
pay on the due date (keeping money-market yield until then) unless an early-payment discount is
worth more; pay COP over Bre-B, MXN over SPEI, BRL over Pix and USD over ACH instead of an
international wire. The receipt shows the yield kept and the fees saved. Rates and fees are
simulated, with their assumption written next to them. This is a small step, not the core.

### Reconciliation

The challenge says "conciliándolo". After paying, Recibido matches each line of a simulated
Blinka bank statement to its payment and links the whole chain: **bank line ↔ payment ↔ bill ↔
contract ↔ evidence**. It handles the FX difference between the bill currency and the USD
debit, transfer fees, partial payments and a returned payment. Unmatched lines are flagged.

## 5. How it decides (design constraints)

- **The language model reads; code decides.** The LLM extracts bill fields and judges whether an
  evidence item supports a bill line (closed judgments with confidence). Hours, amounts, caps,
  dates and FX are computed in code. Any low-confidence reading or match escalates.
- **Deny by default.** A bill pays only if every check passes. A check that cannot run escalates.
- **Safety invariants**, enforced in the engine and re-checked by an independent checker in tests:
  never pay above the contract cap or rate; never pay an amount that is not evidenced when the
  contract requires evidence; never pay a destination other than the registered one; never pay
  the same bill twice; money in integer minor units.
- **Every decision has a receipt**: outcome, the reason in plain Spanish, each evidence item with
  its link, every check with its result, what the reader extracted with its confidence, and what
  would have to be true to pay it.
- Evidence adapters behind one interface. **GitHub is real** (public demo repo, live API or
  webhook). Time tracking, tickets and deliverable acceptance can come from fixtures or CSV
  uploads, clearly labeled.
- Record and replay for LLM calls so the deployed demo works without keys and the eval is
  reproducible (Mandato does this; see its ADR-0010).
- Optional: the semantic "does this evidence support this bill line" judgment is a good fit for
  JEV (TypeSafe), the decision model from the other 30X challenge. Not required.

## 6. Measuring it

A labeled dataset for a fictitious company (**Altamar Labs Inc.**, US entity with contractors in
Colombia, Mexico and Brazil; do not reuse Mandato's "Andes Labs"): about 40–60 bills over two
months with the expected outcome for each, plus the evidence fixtures. An eval command runs the
real services over it and gates CI.

Report: share decided correctly without a person (counting ASK VENDOR cases that the vendor
resolved), improper payments (must be 0), evidence coverage, cases resolved by the vendor, and
time from bill to payment. Baseline: today every services bill goes to a person.

## 7. Three-minute demo (design the build around it)

| Time      | What happens                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:20 | Problem: Altamar pays 14 contractors in 3 countries; services bills always need a person because nobody can prove delivery. |
| 0:20–1:10 | October bills arrive. Recibido decides each one: PAY, PAY PART with the 160 h vs 92 h case, ASK VENDOR, ESCALATE, HOLD.       |
| 1:10–1:40 | The contractor answers the ASK VENDOR message with a corrected bill; it pays without a person. Then a PR is merged live on GitHub and the pending milestone pays itself. |
| 1:40–2:20 | A receipt: evidence links, checks, reason, counterfactual. Reconciliation view: bank line ↔ payment ↔ bill ↔ contract ↔ evidence, with FX. |
| 2:20–2:45 | Scorecard from the eval: autonomy, 0 improper payments, cases the vendor resolved, yield kept and fees saved.                  |
| 2:45–3:00 | Monthly cost and the pilot proposal for Blinka.                                                                                 |

The jury must be able to walk the flow alone: a one-click demo reset and a guided tour.

## 8. Scope

In: services three-way match, evidence adapters (GitHub live, others from fixtures/CSV), vendor
conversation (simulated inbox and a contractor-facing view in the app), the five outcomes,
receipts, when/rail step, reconciliation against a simulated statement, labeled dataset and eval,
landing page with the live demo, deployable build.

Out: real money, real Blinka API (not public; simulate it behind an interface), real WhatsApp
or e-mail sending (simulate, or one real e-mail at most), fraud scoring, KYC, tax compliance.

Anti-goals (a failure even if it technically works): the LLM deciding a payment; a demo that
only works when the team drives it; a Mandato clone (standing mandates, trust ladder, attack lab
as the core); numbers in the pitch that the eval did not measure.

## 9. How it differs from Mandato

| Question the agent answers | Mandato                                      | Recibido                                               |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Core question              | Is this payment authorized by what a person signed? | Was the work being charged actually delivered? |
| What raises autonomy       | People sign standing agreements over time    | Evidence proves delivery; vendors fix their own gaps   |
| Partial payments           | No                                           | Pays the evidenced part                                |
| Reconciliation             | Ledger and CSV export                        | Bank line ↔ payment ↔ bill ↔ contract ↔ evidence, FX   |
| Blinka-specific            | Generic AP                                   | Local rails (Bre-B, SPEI, Pix) and yield-aware timing  |

Mandato is the quality bar for engineering and finish (docs, ADRs, eval in CI, receipts,
guided demo, tests). Match or exceed it; do not copy its concept.

## 10. Build notes

- Stack: same as Mandato so the team can maintain either (pnpm TypeScript monorepo, Hono +
  zod-openapi API, Drizzle with Postgres/PGlite, Next.js + Tailwind web, Vitest). Builder may
  deviate with a written reason.
- Product UI in Spanish (LatAm users and jury); code, docs and commits in English.
- LLM: OpenAI-compatible client; DeepSeek is available locally through `DEEPSEEK_API_KEY_PRINCIPAL`.
- Deployable: Dockerfile and/or Vercel config ready. Do not deploy without the user's approval.
- README: architecture diagram, how to run, security measures, monthly cost estimate with the
  arithmetic, results table from the eval.

## 11. Assumptions to validate with the team

- Services and contractor bills are a large share of what Blinka customers pay.
- The Blinka judge accepts partial payments as a valid outcome.
- A public GitHub demo repo plus a webhook or polling is acceptable for the live moment.
