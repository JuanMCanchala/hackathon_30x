# ADR-0011: GitHub evidence by polling and by a signed webhook

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The demo's live moment is a milestone that pays itself when its PR is merged on GitHub. A webhook
is instant but needs a public URL; polling works anywhere but lags. A webhook endpoint is also an
unauthenticated door into the evidence store.

## Decision

`GithubEvidence` ([`github.ts`](../../apps/api/src/services/github.ts)) tracks only the PRs that
contract terms name. With `GITHUB_REPO` set, it polls the REST API every `GITHUB_POLL_MS` (5 s by
default). `POST /api/v1/webhooks/github` accepts `pull_request` events only with a valid
`X-Hub-Signature-256` (HMAC-SHA256 of the raw body, compared timing-safe) and ignores untracked
PRs; without a configured secret every webhook is refused. Without a repository, the tour's merge
step stores the dataset's merge as fixture evidence. GitHub errors (403, 404, 429) leave the
evidence unchanged.

## Consequences

- The live merge works locally (polling) and deployed (webhook); a forged event changes nothing.
- A merged PR is evidence, not a payment: the engine still checks rate, cap, payout and duplicates.
