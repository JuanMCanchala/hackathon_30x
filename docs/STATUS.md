# Status — Recibido

Updated 2026-10-17 (second session stopped when the usage limit was reached). Plan:
`docs/superpowers/plans/2026-10-17-recibido.md` (15 tasks). Design: `docs/PROPOSAL.md`, visual
identity: `docs/DESIGN.md`, evaluation: `docs/EVALUATION.md`.

## What works (reviewed and committed)

| Task | What                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–5  | Monorepo, CI; deny-by-default engine (18 checks, five outcomes, Spanish receipts); payment planner (Bre-B/SPEI/Pix/ACH, yield vs discount); reconciliation matcher; independent invariant checker + property tests |
| 6–7  | Dataset Altamar Labs Inc. (14 vendors, 45 bills Sep–Oct 2026) rendered as PDF/e-mail/WhatsApp; payout-scanner precision                                                                                            |
| 8    | Config, Drizzle/PGlite, document text, LLM reader + line matcher with record/replay (DeepSeek V4.1 Flash via OpenRouter)                                                                                           |
| 9    | Services: evaluate bills, vendor loop + contractor portal, human resolution, evidence re-evaluation, GitHub poll + signed webhook                                                                                  |
| 10   | Simulated Blinka rail and bank statement, reconciliation view, demo with guided tour, HTTP API (`/docs`), admin token outside demo mode, API Dockerfile                                                            |
| 11   | `pnpm eval` (CI gate, `--require-replay`), real recordings committed                                                                                                                                               |
| 12   | Web identity, shell, landing (`/`)                                                                                                                                                                                 |
| 13   | App screens: resumen, cuentas + receipt, proveedores, conversaciones, conciliación, recorrido, contractor portal; screenshots in `docs/images`                                                                     |

Measured by `pnpm eval` (both the reference reader and the recorded DeepSeek readings): final
status correct 45/45; decided correctly without a person 33/41 (80.5 %, the label ceiling; 5
after a vendor reply, 4 by new evidence after an ask); **0 improper payments**, 0 checker
violations; critical fields read correctly 480/495 (97.0 %); model cost USD 0.00088 per bill.
`pnpm test` passed 274 tests at the last run; typecheck, lint, format and builds clean.

Run it: `pnpm install && pnpm dev` (web on :3000, API on :4000), then open **Recorrido**.

## Pending

1. **Task 13 fixes (review found):**
   - A person can approve `oct-19` (currency unread) and pay "COP 1.200". Block approval when the
     reading has no currency or a low-confidence total, in the UI and in `resolveEscalation`
     (409 + API test).
   - Network errors show the browser's English "Failed to fetch"; wrap `fetch` in
     `apps/web/lib/api.ts` with a Spanish message.
   - Minor: "Sí, aprobar y pagar" when nothing is owed; duplicated constants into
     `lib/format.ts`; HOLD summary prints raw bill ids (engine copy); "(sin moneda)" wording;
     the demo clock moves backwards between tour steps.
2. **Task 14:** Playwright E2E of the demo path (`pnpm e2e`) + CI job (`playwright install chromium`).
3. **Task 15:** README (results, mermaid architecture, run, security, monthly cost with
   arithmetic from the recordings' usage), SYSTEM_DESIGN, ADRs, RULES, SECURITY, DATASET, API,
   DEPLOY, DEMO (Spanish 3-minute script), docs/product, docker-compose.
4. Final whole-branch review.

The SDD ledger with every review round and ruling is local in
`.superpowers/sdd/2026-10-17-recibido/progress.md` (git-ignored).

## Decisions I made

- LLM: `deepseek-flash` (direct) or `deepseek/deepseek-v4.1-flash` (OpenRouter); JSON mode,
  zod-validated; the reader returns the bare tax id. The LLM maps bill lines to contract terms;
  evidence links are structural, so a live GitHub merge needs no model call.
- Vendor-supplied files never count as evidence. Any payout-change wording escalates.
- Revisions chain only through the portal token, never from the bill's own text; a correction
  to a closed case is refused.
- A returned payment (`oct-12-r1`) keeps the bill PAID; reconciliation flags the return.
- Outside demo mode every write needs `Authorization: Bearer ADMIN_TOKEN`; CORS only
  `PUBLIC_WEB_URL`; portal links are HMAC-signed.
- The matcher prompt (matcher-2) no longer lets a unit guess alone lower confidence; code still
  checks hours and rates. Truth labels were never edited to match the model.

## What only you can do

- **LLM credit:** DeepSeek direct API says "no balance"; OpenRouter has about USD 0.25 left.
  The demo works without keys (recorded readings); keys are only needed to read new uploads.
- Create the public GitHub demo repo with an open PR and set `GITHUB_REPO`, `GITHUB_DEMO_PR`,
  `GITHUB_WEBHOOK_SECRET` for the live merge moment (otherwise the merge is simulated).
- Deploy (Railway API + Postgres ≈ USD 20/month; web on Vercel Hobby) and record the video.
- Remove the design kit skills copied to `~/.claude/skills/{impeccable,design-taste-frontend,emil-design-eng}`
  (marked `.de-diseno-web-kit`) when the UI work is finished.
