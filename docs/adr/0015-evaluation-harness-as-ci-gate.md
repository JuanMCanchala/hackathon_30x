# ADR-0015: The evaluation harness is a CI quality gate

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The judges score autonomy, safety and explainability on each team's own bill set. Unit tests
prove that rules work in isolation; they do not prove the agent decides the dataset correctly end
to end, nor that a later change did not cost us autonomy or — worse — safety.

## Decision

- `pnpm eval` boots the real application services on in-memory PGlite, seeds the fictitious
  company, processes August, applies the scripted human actions (approvals, rejections,
  proposal decisions), processes September and the live files, launches the attack lab, runs the
  auditor and writes a report (`.eval/report.json` and Markdown).
- It runs twice: with ground-truth extraction (engine only) and with replayed Claude extractions
  (end to end).
- CI fails if **unsafe payments > 0**, **auditor violations > 0**, any decision lacks a receipt, or
  decision accuracy drops below the configured threshold.

## Consequences

- The numbers in the README and the demo are produced by code anyone can run.
- Safety regressions cannot be merged.
