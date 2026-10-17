# 02 · Solution: Mandato

> **"Firma acuerdos, no pagos."** — Sign agreements, not payments.

## The insight

Trust in a person who pays your bills is not configured once — it is **earned**. A new finance
assistant gets small limits; as they prove themselves, their manager writes down standing
instructions ("pay Valentina her monthly fee; anything above that, ask me"). After a few months
they handle 90% of the bills alone and only bring the exceptions.

Mandato encodes exactly that loop:

1. **Humans sign mandates, not payments.** A _mandate_ is a standing agreement: _"Pay Valentina
   Ríos up to COP 14,000,000 per month, once per month, to her registered Bre-B key."_ The CFO
   signs it once. Every bill that fits a signed mandate — and the global policy — is paid by the
   agent without anyone touching it.
2. **Everything else is escalated, with a precise reason.** When a bill does not fit, the agent
   escalates and states exactly which rule failed and what would have made it pass.
3. **The agent proposes, a human signs.** When a person approves an escalation, the agent proposes
   the mandate change that would have avoided it ("Tablero.io now bills USD 620 — update the
   agreement?"). The human accepts or rejects. **The agent never edits its own rules.**
4. **Autonomy climbs, safety stays at zero.** Month after month the share of bills decided
   without a person rises, while an independent auditor keeps certifying zero payments outside
   the rules.

## The safety guarantee

> Every `PAY` decision sends money only to a **registered destination**, **inside a signed
> mandate**, and **within the current limits and budget** — **even if the document reader is
> wrong or manipulated**.

This holds because the language model never decides. It only reads the bill. A deterministic
policy engine — plain code with property-based tests — makes every decision, and an auditor
written independently from the engine re-checks every payment against the invariants. A forged or
injected bill can, at worst, be paid to a payee the company already pays, for an amount the
company already signed for.

## The four differentiators

| #   | Feature                              | What it shows                                                                                                                                  | Criterion it wins                |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | **Trust ladder**                     | Month 1 → humans resolve escalations, accept proposals → month 2: autonomy jumps, violations stay 0.                                           | Autonomy (+ Safety)              |
| 2   | **Receipts with "what was missing"** | Each decision lists every rule checked and the exact counterfactual: _"It would have been paid automatically if the amount were ≤ USD 3,000."_ | Explainability                   |
| 3   | **"Attack the agent" lab**           | Launch duplicates, split bills, changed bank details, injected instructions, look-alike payees… live. None get through.                        | Safety                           |
| 4   | **Plug-in for any agent (MCP)**      | Any company agent (Claude, an in-house bot) can _request_ a payment through Mandato's MCP tools and gets the same rules and receipts.          | "Why now": companies' own agents |

## What the product does, end to end

```
Bill arrives (PDF · image · email · chat · agent request)
  → Reader (Claude): extracts payee, amount, currency, dates, payout details, confidence
  → Policy engine (code): evaluates ~20 rules → PAY · HOLD · ESCALATE
  → Receipt: every rule, observed vs expected, counterfactual, policy & mandate versions
  → Ledger: append-only, hash-chained; exportable for reconciliation
  → If ESCALATE: approval request (web or one-tap signed link, 2 approvers above a threshold)
  → If approved: the agent proposes a mandate change → a human accepts or rejects
  → Auditor: independently re-checks every payment; certifies "0 payments outside the rules"
```

## Three outcomes, precisely defined

| Outcome    | Spanish UI  | Meaning                                                                                                  |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `PAY`      | **Pagar**   | Every rule passed. The agent schedules the payment (simulated — no money moves) and reserves budget.     |
| `HOLD`     | **Frenar**  | It must not be paid and no approval would fix it as-is (duplicate, blocked payee, insufficient balance). |
| `ESCALATE` | **Escalar** | It may be legitimate but falls outside what was signed: a person decides.                                |

## Out of scope, on purpose

Mandato does not move money, verify identities or make fraud/compliance judgements. Where a rule
_looks_ like fraud detection (changed bank details, look-alike names) it is framed and implemented
as a **consistency check against what the company registered** — the decision goes to a human.
