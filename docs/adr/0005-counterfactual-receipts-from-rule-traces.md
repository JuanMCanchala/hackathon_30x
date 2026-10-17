# ADR-0005: Explanations and counterfactuals are generated from rule traces, not by an LLM

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The explainability criterion requires that anyone understands each decision "by reading its log,
without opening the code". An LLM-written explanation would read well but could disagree with what
the engine actually did — an explanation that can lie is worse than none.

## Decision

- Each rule result carries structured facts (`observed`, `expected`) and two Spanish sentences
  rendered from templates: `detail` (what happened) and `remedy` (what would have changed the
  outcome).
- The decision `summary` is composed from the failing rules (or, for `PAY`, from the mandate and
  limits that were satisfied).
- The **counterfactual** is the list of `remedy` sentences of the failing rules: _"Se habría pagado
  sola si el monto fuera ≤ USD 5.000 o si firmas una excepción para Código Norte."_
- Receipts also record the policy version, mandate version and FX snapshot, so any reader can
  recompute the decision.

## Consequences

- Explanations are always consistent with the decision: they are the decision's own trace.
- The text is less "creative", but exact and testable (snapshot tests on receipts).
- An LLM may still be used for optional, clearly labelled summaries — never as the record.
