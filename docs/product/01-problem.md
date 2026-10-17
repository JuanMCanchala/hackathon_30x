# 01 · Problem

> Challenge: **Blinka — "Agentes que pagan por la empresa"** (30X Hackathon, October 2026).
> Build an agent that reviews a company's bills, decides which ones to pay on its behalf within
> the rules the company defines, and asks a person for permission when something falls outside
> those rules.

## Who has the problem

US-incorporated companies that operate across several countries, with employees, vendors and
contractors in Latin America and other regions. Their finance teams make dozens of payments a
month, in several currencies, to several countries.

## How it works today

1. A bill arrives by email, as a PDF, or as a chat message ("te paso mi cuenta de cobro…").
2. Someone in finance reads it, compares it with what was agreed and looks up the payee's
   banking details.
3. They ask for approval by chat or email.
4. They log into the banking platform and create the payment by hand, often in another currency
   and to another country.
5. They reconcile in a spreadsheet what was paid and why.

Every step is manual, repeats every month, and depends on a specific person being available.

## Why now

Companies are building their own agents and want those agents to pay too. The missing piece is
**trust**: an agent that pays only what it should, explains every decision, and never exceeds the
limits it was given.

## What is in scope

- Read a bill and extract **who**, **how much**, **which currency** and **by when**.
- Decide whether to pay it under configurable rules: per-payment and per-period limits, allowed
  payees, and human approval above a threshold.
- Keep a record of every decision — paid, held or escalated — and why.

## What is out of scope

- Executing real payments or moving money.
- Opening accounts.
- Verifying the identity of companies.
- Compliance or fraud decisions.
- Designing Blinka's app.

## How success is judged

| Criterion          | What the judges look at                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Autonomy**       | How much of the bill set the agent decides **correctly** without a person intervening.          |
| **Safety**         | **Zero** payments approved outside the rules. Approving an improper payment disqualifies.       |
| **Explainability** | Anyone understands why the agent paid, held or escalated each bill by reading its log, no code. |

## The tension we must resolve

Autonomy and safety pull in opposite directions. The naive ways to win one criterion lose the
other:

- **Escalate everything** → perfectly safe, zero autonomy.
- **Let an LLM judge the rules** → high autonomy until the first confident mistake or prompt
  injection, which is an instant disqualification.

The product has to make autonomy **grow** without ever trading away safety. That is the problem
[02 · Solution](02-solution.md) answers.
