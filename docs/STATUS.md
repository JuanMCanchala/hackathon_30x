# Status — Recibido

Updated 2026-10-17, after the final whole-branch review and its fixes. Plan:
`docs/superpowers/plans/2026-10-17-recibido.md`. Design: `docs/PROPOSAL.md`, visual identity:
`docs/DESIGN.md`, evaluation: `docs/EVALUATION.md`.

**Live demo: <https://recibido.vercel.app>** (open **Recorrido**). Every task is done and reviewed.

## What is done

| Task  | What                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–5   | Monorepo, CI; deny-by-default engine (18 checks, five outcomes, Spanish receipts); payment planner (Bre-B/SPEI/Pix/ACH, yield vs discount); reconciliation matcher; independent invariant checker + property tests |
| 6–7   | Dataset Altamar Labs Inc. (14 vendors, 45 bills Sep–Oct 2026) rendered as PDF/e-mail/WhatsApp; payout-scanner precision                                                                                            |
| 8     | Config, Drizzle/PGlite, document text, LLM reader + line matcher with record/replay (DeepSeek V4.1 Flash)                                                                                                          |
| 9     | Services: evaluate bills, vendor loop + contractor portal, human resolution, evidence re-evaluation, GitHub poll + signed webhook                                                                                  |
| 10    | Simulated Blinka rail and bank statement, reconciliation view, guided demo tour, HTTP API (`/docs`), admin token outside demo mode, API Dockerfile                                                                 |
| 11    | `pnpm eval` (CI gate, `--require-replay`), real recordings committed                                                                                                                                               |
| 12–13 | Web identity, landing, app screens (resumen, cuentas + receipt, proveedores, conversaciones, conciliación, recorrido, contractor portal), motion; review fixes (no approval of an unread amount, Spanish errors)   |
| 14    | Playwright E2E of the demo path (`pnpm e2e`, real portal reply, merge, reset, close) + CI job                                                                                                                      |
| 15    | Docs: README, SYSTEM_DESIGN, 15 ADRs, RULES, SECURITY, DATASET, API, DEPLOY, DEMO (3-minute script), docker-compose                                                                                                |
| 16    | Hosted demo: one Vercel project with the API embedded in-process ([DEPLOY.md](DEPLOY.md#the-hosted-demo-one-vercel-project))                                                                                       |

Final review fixes: the hosted tour replays forward only and never rewinds for a cookie; a real
portal reply from Daniela counts as her tour step; the approve panel says how much has no
evidence; hosted uploads capped at 4 MB.

## Measured (last run)

- `pnpm eval --require-replay` (reference reader and the recorded DeepSeek readings): final status
  correct 45/45; decided correctly without a person 33/41 (80.5 %, the label ceiling; 5 after a
  vendor reply, 4 by new evidence after an ask); **0 improper payments**, 0 checker violations;
  critical fields read correctly 97.0 %; model cost USD 0.00088 per bill.
- `pnpm test` 283 passed (24 files); `pnpm e2e` 2 passed; typecheck, lint and format clean.

Run it locally: `pnpm install && pnpm dev` (web on :3000, API on :4000), then open **Recorrido**.

## Decisions I made

- LLM: `deepseek-flash` (direct) or `deepseek/deepseek-v4.1-flash` (OpenRouter), the same model;
  JSON mode, zod-validated; the reader returns the bare tax id. The LLM maps bill lines to
  contract terms; evidence links are structural, so a live GitHub merge needs no model call.
- Vendor-supplied files never count as evidence. Any payout-change wording escalates.
- Revisions chain only through the portal token, never from the bill's own text; a correction to
  a closed case is refused.
- A returned payment (`oct-12-r1`) keeps the bill PAID; reconciliation flags the return.
- Outside demo mode every write needs `Authorization: Bearer ADMIN_TOKEN`; CORS only
  `PUBLIC_WEB_URL`; portal links are HMAC-signed.
- The matcher prompt (matcher-2) no longer lets a unit guess alone lower confidence; code still
  checks hours and rates. Truth labels were never edited to match the model.
- Demo clock: each tour step sets the org clock to its own scripted time; the "Hoy en la demo"
  display shows the latest moment reached (`shownNow`), so it never goes backwards on screen.
- A person cannot approve an escalated bill whose total or currency was not read, or whose total
  confidence is under the policy minimum (409).

## Known limits

- **Hosted demo** (state in memory per Vercel instance): visitors who share an instance share its
  demo; a cold start takes up to about 10 s; the state goes back to October 1 (or to the
  visitor's tour step, from the cookie) when Vercel recycles an instance; uploads, people's
  decisions and portal replies outside the tour live only in the instance that received them;
  uploads are capped at 4 MB (Vercel's request limit is 4.5 MB). No live GitHub merge
  (simulated) and no background polling there.
- A returned payment on a `PART_PAID` case would be paid again if the case were re-decided (a
  returned payment no longer counts as paid). The dataset never does this; see
  [SECURITY.md](SECURITY.md#known-limits).
- Portal tokens do not expire; the decision lock is per process (one API instance).

## What only you can do

- **Record the video** against <https://recibido.vercel.app> (script in [DEMO.md](DEMO.md)).
- **LLM keys:** DeepSeek direct now has credits (topped up); the committed recordings were made
  through OpenRouter with the same model. The demo needs no keys (recorded readings); a key is
  only needed to read new uploads (`LLM_PROVIDER=deepseek wallenv run -- pnpm dev`).
- Optional: a public GitHub demo repo with an open PR, and `GITHUB_REPO`, `GITHUB_DEMO_PR`,
  `GITHUB_WEBHOOK_SECRET`, for a live merge moment (otherwise the merge is simulated).
- Optional: a Postgres (`DATABASE_URL`) and a long-running API host (Railway ≈ USD 20/month) for a
  hosted demo whose state persists across instances.
- Remove the design kit skills copied to
  `~/.claude/skills/{impeccable,design-taste-frontend,emil-design-eng}` (marked
  `.de-diseno-web-kit`) when the UI work is finished.

The SDD ledger with every review round and ruling is local in
`.superpowers/sdd/2026-10-17-recibido/progress.md` (git-ignored).
