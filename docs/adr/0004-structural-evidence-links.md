# ADR-0004: Evidence links are structural; the model maps lines to terms, never to evidence

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The proposal suggested a model judging "does this evidence item support this bill line". That
puts a language model between a merged PR and a payment: every new piece of evidence would need a
model call (cost, latency, a recording to replay), and a crafted line description could talk the
model into accepting unrelated evidence.

## Decision

Each contract term names its evidence requirement structurally: `time_entries` for a Toggl
project, `github_pr` for `owner/repo#n`, `deliverable`, `ticket`, `usage_report` or `delivery` by
id, or `null` when the signed schedule is enough. The model only maps a bill line to a term
([ADR-0002](0002-deterministic-engine-llm-reads-and-maps.md)). Code then collects the evidence
that matches the term's reference (inside the billed period for hours and usage) and computes the
evidenced amount ([`evidence.ts`](../../packages/domain/src/evidence.ts)). Merged PRs behind an
hourly contract are shown as supporting evidence but do not count as hours.

Evidence comes only from the systems of record: Toggl, GitHub, Linear, the client's acceptance of
a deliverable, the usage meter, the reception desk's delivery confirmation. A file the vendor
attaches is never evidence.

## Consequences

- A live GitHub merge re-decides the bill with no model call; it pays in seconds.
- The evidenced amount is exact and auditable; the receipt links each item.
- A contract must name its evidence precisely; a term whose evidence never arrives asks the vendor.
