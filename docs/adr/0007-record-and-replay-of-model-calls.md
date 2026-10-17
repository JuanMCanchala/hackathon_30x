# ADR-0007: Record and replay every model call

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The deployed demo must work without API keys, the eval must be reproducible in CI, and the jury
must see the real model's readings, misreadings included, not a mock.

## Decision

Every model call goes through `CachedLlm` ([`cache.ts`](../../apps/api/src/llm/cache.ts)). The key
is the SHA-256 of the stable JSON of `{ kind, version, ...input }`; recordings live in
`packages/dataset/recordings/<read|match>/<key>.json` with the provider, model, latency and token
usage. On a hit the answer replays; on a miss the model is called when one is configured (and the
answer is written when `RECORD=true`); otherwise the reading fails and the engine escalates.
`READER_VERSION` and `MATCHER_VERSION` are part of the key, so changing a prompt makes old
recordings stale instead of silently wrong. `pnpm record` re-records with the live model.

## Consequences

- The demo and the eval need no key and cost nothing; the eval's cost figures come from the
  recordings' usage.
- A prompt change without re-recording fails CI ([ADR-0014](0014-evaluation-as-ci-gate.md)).
- A corrupt recording, or one that fails the schema, is treated as a miss.
