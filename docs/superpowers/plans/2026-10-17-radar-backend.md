# Radar 30X: back-end hardening before deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what breaks the deployed demo (the API doesn't start, empty topic pages, a radar that drifts to 0 topics, open destructive endpoints), then add the improvements that score the most with the jury, all on the back end. The front end is being redesigned by another team: don't touch `apps/web`, except to keep the API contract stable.

**Branch:** `feat/radar-backend`, cut from `feat/radar` at `ccff77d`, in the worktree `30x/30x-radar`. Before every push, rebase on `origin/feat/radar`. Push only this branch; Juan or Nicolás merges it.

**Sources:** the back-end audit, the technology research and the security review from 2026-10-17. Their findings are summarized here with file:line evidence. Rubric and deadline: `30x/contexto-hackathon.md`.

## Global Constraints

- Deadline: Sunday 2026-10-18, 12:00 PM Colombia, in HackRadar. Deploy (Railway + Vercel) comes right after this plan, so Tasks 1–5 come first.
- TDD: write a failing test first for every behavior change. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before each commit. CI also runs `pnpm eval` and `pnpm build`, and both must stay green.
- `pnpm format:check` fails locally on every file because of CRLF (`core.autocrlf=true` on Windows). Ignore it; run `pnpm prettier --check <changed files>` on your own files instead.
- Secrets are read only through wallenv (`wallenv run -- …`). Never read `.env` files. Commits carry no Claude attribution (user rule).
- Code comments in English, user-facing copy in Spanish, matching the repo.
- `DEMO_MODE=true LLM_MODE=replay` must keep working with no keys: a clean start loads `data/snapshot` (388,249 rows) and `/api/v1/radar` returns 10 topics.

## Review Focus

1. The clock moves after deploy: on Sunday morning the frozen week must still show the same 10 topics with their "why" and fit (Tasks 2 and 3).
2. A stranger on the internet calls every POST/DELETE route of the public API (Task 4).
3. The front end parses every timestamp in Safari (Task 6).
4. A cold start on Railway: the server must answer the healthcheck within its timeout (Task 5).
5. With live keys (`LLM_MODE=auto`), opening a topic page must not trigger paid model calls for the frozen week (Task 2).

---

### Task 1 (BLOCKER): the built API must start

The `cheerio` and `fast-xml-parser` packages are left out of the bundle by `apps/api/build.mjs`, but they are only dependencies of `@radar/sources`. With pnpm's strict `node_modules`, `node apps/api/dist/index.js` cannot resolve them.

- [ ] Run `pnpm --filter @radar/api build && node apps/api/dist/index.js` with `DEMO_MODE=true LLM_MODE=replay PORT=4199`. Expected: a crash on import (this confirms the bug).
- [ ] Fix: `pnpm add --filter @radar/api cheerio fast-xml-parser`, using the same versions as `packages/sources/package.json`. The alternative is to bundle them; pick whichever starts.
- [ ] Re-run the same command. Expected: `/api/v1/health` returns 200 and `/api/v1/radar` returns 10 topics. Kill the process.
- [ ] Add a CI step after `pnpm build` that starts `dist` in replay mode, curls `/api/v1/health`, then kills it.
- [ ] Commit `fix(api): resolve cheerio and fast-xml-parser from the built API`.

### Task 2 (BLOCKER): topic pages lose "why" and fit

Analyses are keyed by the UTC date of `asOf`: see `packages/core/src/growth.ts:159`, with the lookups in `apps/api/src/services/explain.ts:87` and `:133`. The snapshot's analyses are dated `2026-10-17`, but the snapshot's `asOf` is `2026-10-18T00:11:57Z`. Result: `/api/v1/topics/:id` returns `narrative: null` for all 10 topics and `fit: null` for 9 of them. The radar list (`apps/api/src/services/radar.ts:198-217`) uses the latest analysis whatever its week, so the list and the detail page disagree. With live keys, every first visit to a topic page calls the model.

- [ ] Test in `apps/api/test/`: load a fixture whose analysis week differs from the `asOf` day. `GET /api/v1/topics/:id` must return the stored `why.narrative` and `fit`, and must not call the LLM. Use the scripted `Llm`, which throws on unexpected calls. Watch it fail.
- [ ] Fix `stored()` in `explain.ts`: if nothing matches the exact week, fall back to the topic's latest analysis of that kind, the same rule as `topicMeta` in `radar.ts`.
- [ ] Verify against the real snapshot in replay mode: all 10 topics return a narrative and a fit.
- [ ] Commit `fix(api): read a topic's latest analysis when its week has none`.

### Task 3 (BLOCKER): the scheduler and saves move the radar's week

`startWatchScheduler` (`apps/api/src/index.ts:39`) runs the snapshot's active "negocios" watch at boot, even in replay mode. `saveItems` sets `lastSeenAt = now` (`apps/api/src/pipeline/ingest.ts:51`, `:81`), and `asOfOf` takes `max(lastSeenAt)` (`radar.ts:130`).

The audit measured the effect:

- A single run moved the end of the week from 00:11Z to 02:14Z.
- At +3 days the top 10 is a different list.
- At +7 days the radar returns 0 topics.

Every sensor submission and every live Vigía search does the same.

- [ ] Tests:
  - (a) Saving items through Vigía or the sensor does not change the `/api/v1/radar` week or topics.
  - (b) With `DEMO_MODE=true`, the scheduler does not start a run at boot.
- [ ] Fix `asOfOf`: take the latest ingest run in `runs`, or ignore items whose only source is `vigia:%` or the sensor. Pick whichever the schema supports cleanly.
- [ ] Fix `index.ts`: don't start the watch scheduler when `DEMO_MODE` is on, unless `WATCH_SCHEDULER=true`. A manual "Buscar ahora" from the UI still works.
- [ ] Commit `fix(api): keep the radar's week fixed while Vigía and the sensor save pieces`.

### Task 4 (HIGH): protect the endpoints that destroy data or spend money

No route has auth, and CORS reflects any origin (`apps/api/src/http/app.ts:17`). The security review confirmed what one unauthenticated `curl` can do:

- `POST /api/v1/pipeline/run` with `{rebuild:true}` wipes topics, analyses and adaptations (`routes/radar.ts:91-102`, `pipeline.ts:110-114`).
- `POST /api/v1/snapshot` writes to disk (`routes/radar.ts:105`).
- `DELETE /api/v1/watches/:id` deletes the demo's watch.
- Calendar deletes are open too.
- `ask`, `adapt` and `POST /watches` spend LLM and JEV money with no limit.

- [ ] Tests:
  - Without `Authorization: Bearer <ADMIN_TOKEN>`, `pipeline/run`, `snapshot`, `DELETE /watches/:id` and calendar deletes return 401. With the token, they work.
  - With no `ADMIN_TOKEN` configured, those routes return 403 when `DEMO_MODE` is on.
  - The 6th active watch is refused with 409.
- [ ] Implement:
  - Add `ADMIN_TOKEN` as an optional setting in `config.ts` and `env.example`.
  - Write one small Hono middleware that compares the token in constant time.
  - Cap active watches at 5.
  - Add a simple in-memory per-IP limit (for example 20 per hour) on `ask`, `adapt` and `POST /watches`.
  - Restrict CORS to `PUBLIC_WEB_URL`.
- [ ] Commit `fix(api): guard destructive and paid endpoints`.

### Task 5 (HIGH): deploy-ready startup

A clean boot imports 388,249 rows in about 31 s and peaks at about 1.0 GB. `snapshot.ts:90` parses each whole file in memory, and the server only listens after the import.

- [ ] Start listening first: `/api/v1/health` answers right away, and other routes answer 503 with `{"error":"loading"}` until the import finishes. Test it with a delayed import.
- [ ] Optional, only if under 30 minutes: stream the gunzip and parse the JSON lines one at a time to cut peak memory.
- [ ] Add a "Desplegar" section to the README:
  - Railway with at least 1 GB, a volume mounted at `DATA_DIR`, a healthcheck on `/api/v1/health` and a 120 s timeout.
  - Start command `pnpm --filter @radar/api start` after `pnpm install && pnpm --filter @radar/api build`.
  - Env vars: `DEMO_MODE=true`, `LLM_MODE=auto`, `FIREWORKS_API_KEY`, `TYPESAFE_API_KEY`, `ADMIN_TOKEN`, `PUBLIC_WEB_URL`.
  - Vercel: set `API_URL` at build time, because `next.config.ts` reads it for the rewrites.
- [ ] Commit `fix(api): answer health checks while the demo week loads`.

### Task 6 (MEDIUM): API contract for the new front end

- [ ] Watch timestamps come back as raw Postgres strings (`"2026-10-17 19:16:35.256-05"`, from `schema.ts:20` `mode:'string'`), which Safari can't parse. Map them with an `iso()` helper in `watch.ts`. Add a test.
- [ ] Explain an empty platform filter. Today `/radar?platform=instagram` returns 0 topics with no reason. Add `coverage: { platform, pieces, reason }` to the response when fewer than 10 topics match, without breaking the current fields.
- [ ] Write `docs/api.md`: one table of every route with method, params and response shape, including the space-separated `sparkline` and `platforms` strings. `/openapi.json` is empty (`"paths":{}`) because routes use `app.get`; either remove the `/docs` link or point it at `docs/api.md`.
- [ ] Commit `fix(api): ISO dates and a written contract for the new front end`.

### Task 7: smoke test that would have caught Tasks 2–3

- [ ] Add one test that loads a snapshot fixture and checks four things:
  - The radar returns topics.
  - Each topic detail has a narrative and a fit.
  - A sensor submission plus a Vigía save leave the week unchanged.
  - Every timestamp in the responses parses with `Date.parse`.
- [ ] Commit `test(api): smoke the demo week end to end`.

### Task 8 (jury value, if time allows): measure that ideas reach Spanish later

The technology research recommends using Wikipedia as ground truth for language lag. For each of the 18 backtest waves:

- the creation date of the English article versus the Spanish one: `action=query&prop=langlinks&lllang=es`, then the first revision with `rvdir=newer`;
- the en and es pageview peaks, using the fetcher in `packages/sources/src/series.ts`.

Send a User-Agent header. These endpoints answered without a key on 2026-10-17.

- [ ] Write a recorded fixture and a test. Compute the lag in days per wave and the median.
- [ ] Add the result to `pnpm eval` and to the README's «Lo viral nace en otro idioma» section, for example: «mediana de X días entre el artículo en inglés y en español».
- [ ] Commit `feat(core): measure how long AI waves take to reach Spanish Wikipedia`.

### Task 9 (if time allows): small, cheap upgrades

- [ ] **ELD language detection** (`eld` on npm, Apache-2.0):
  - Use the platform's language first (Bluesky `langs`), then ELD limited to en/es/pt, then the current `guessLang` (`packages/core/src/screen.ts`).
  - If ELD runs in api/sources, keep it out of core so core stays pure. Add a test.
- [ ] **Poisson burst check** next to the lift in `packages/core`: P(X ≥ this week's creators | baseline mean). Keep it only if `pnpm eval` shows fewer than 2/10 false alarms with 18/18 waves still detected. Otherwise drop it and cite Kleinberg in the README.
- [ ] **Re-check each redirect hop** in `packages/sources/src/http.ts` `send()`: https only, and no private or link-local hosts.
- [ ] **Fence scraped text in LLM prompts** (`explain.ts:90-101`, `insights.ts:182`): add one line saying it is untrusted data.
- [ ] **README fixes:**
  - The snapshot has about 112 public emails taken from YouTube descriptions. Either soften «nada de correos» or scrub emails at ingest.
  - Pitch and README must state the same monthly cost.
  - Future work: Bluesky Jetstream, the Google Trends API alpha and BERTopic.
  - Limits: Reddit and TikTok Creative Center closed public access in 2026.
  - Check that the Snap 2026 paper really uses distinct creators before citing it.
- [ ] One commit per item.

### Not in this plan

- Front end (another team).
- YouTube Data API `videos.list`: it needs a Google Cloud API key in wallenv. Add it only if Nicolás provides one.
- Populating LinkedIn with Apify: 2–3 hours, with risk.
- GDELT: test it from the Railway host first.

## Finish

- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm eval` and `pnpm build`. Then run a clean replay start: 10 topics, each with why and fit.
- [ ] Have a fresh reviewer look at the whole branch, then fix its Critical and Important findings with TDD.
- [ ] Rebase on `origin/feat/radar`, push `feat/radar-backend` only, and give Nicolás a short message for Juan.
