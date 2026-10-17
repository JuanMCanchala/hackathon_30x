# ADR-0014: The evaluation is a CI gate and requires the recordings

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Numbers in the pitch must be measured, and a change that lets one improper payment through must
fail before it merges. An eval that silently skips the model's readings when a recording is missing
would report the reference run's perfect numbers as if they were the agent's.

## Decision

`pnpm eval` ([`eval.ts`](../../apps/api/src/scripts/eval.ts)) runs the September and October
scripts through `runStep`, the same runner the guided demo uses, twice: with ground-truth reading
(are the rules right?) and with the recorded model answers (is the agent right?). It fails on any
improper payment, any checker violation, final-status accuracy below 95 %, or any refused step in
the reference run. In CI (`CI` set, or `--require-replay`) a missing or stale recording fails the
run, naming its key ([`ci.yml`](../../.github/workflows/ci.yml)). The truth labels are never edited
to match the model. Method: [EVALUATION.md](../EVALUATION.md).

## Consequences

- The demo cannot drift from what is measured.
- After a prompt change, CI fails until the answers are re-recorded (intended).
- `pnpm eval --write-docs` regenerates the results in EVALUATION.md.
