# Status — Recibido

Updated 2026-10-17 (overnight session stopped early: the session's usage limit was reached).
Plan: `docs/superpowers/plans/2026-10-17-recibido.md` (15 tasks). Design: `docs/PROPOSAL.md`,
visual identity: `docs/DESIGN.md`.

## What works (reviewed and committed)

| Task | What                                                                                                                                        | Verified                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | pnpm monorepo, money helpers, CI workflow, `env.example`                                                                                    | tests, typecheck, lint, format |
| 2    | Domain types, text scanners, per-line evidence math                                                                                         | 2 review rounds                |
| 3    | Deny-by-default decision engine (18 checks, five outcomes), Spanish receipts, counterfactual, vendor messages                               | Opus review, approved          |
| 4    | Payment planner (when and which rail: Bre-B, SPEI, Pix, ACH; yield vs discount) and bank reconciliation matcher                             | approved                       |
| 5    | Independent invariant checker (I1–I7), scorecard, fast-check property tests (payout fraud, revisions, independent chains); engine hardening | 2 review rounds                |
| 6    | Dataset Altamar Labs Inc.: 14 vendors, 15 contracts, 45 bills (Sep–Oct 2026), script, expected outcomes, replay oracle                      | approved + polish              |
| 7    | Rendered documents (PDF via pdf-lib, `.eml`, WhatsApp `.txt`), deterministic; payout-scanner precision against real text                    | 3 review rounds                |
| 8    | API foundation: config, Drizzle/PGlite schema + migration, document text, LLM reader and line matcher with record/replay                    | 2 review rounds                |

`pnpm test` passes (221 tests at the last run), plus typecheck, lint, format check and the API build.

## Pending (in plan order)

- **Task 9** API services (evaluate bills, vendor loop + portal, human resolution, evidence
  re-evaluation, GitHub poll + signed webhook). Started and stopped before any commit.
- **Task 10** simulated Blinka rail, bank statement, reconciliation view, demo service, HTTP routes, Dockerfile.
- **Task 11** eval harness (`pnpm eval`) + recording all LLM readings + CI gate.
- **Tasks 12–13** web (landing, app screens, contractor portal, guided tour) following `docs/DESIGN.md`.
- **Task 14** Playwright E2E and screenshots. **Task 15** README, SYSTEM_DESIGN, ADRs, RULES,
  SECURITY, DATASET, EVALUATION, API, DEPLOY, DEMO (Spanish), docs/product.

The SDD ledger with every review round and ruling is in `.superpowers/sdd/2026-10-17-recibido/progress.md`
(git-ignored, local only). Restart by dispatching Task 9 with the notes in that ledger.

## Bugs found and not yet fixed

1. **Vendor resolution fails with the real model's readings.** DeepSeek returns tax ids with their
   label (`C.C. 1.036.645.218`, `NIT 901.234.567-1`, `CNPJ …`, `EIN …`); `normalizeTaxId` keeps the
   letters, so `resolveVendor` finds no vendor and every such bill would escalate. Fix in
   `packages/domain/src/text.ts`: strip leading labels (NIT, C.C./CC, CNPJ, CPF, RFC, EIN, Tax ID)
   before normalizing, and/or ask for the bare number in `apps/api/src/reading/prompt.ts`. Add tests.
2. `sep-21`: the model read a September period where the truth says none; check whether the
   rendered document prints a period (then the truth label is wrong) or the model inferred it.

## Decisions I made

- LLM: `deepseek-flash` (verified in the live model list; `deepseek-chat` is being retired), or
  `deepseek/deepseek-v4.1-flash` on OpenRouter. JSON mode `json_object`, zod-validated, one retry.
- The LLM maps bill lines to contract terms; evidence links (PR number, deliverable id, time
  project) are structural, so a live GitHub merge never needs a new model call.
- Vendor-supplied files never count as evidence; a vendor can only send a corrected bill or point
  to evidence in the company's systems. Any payout-change wording escalates.
- Revisions form a chain only through the portal token bound to the bill, never from the bill's
  own "corrects invoice X" text. Already-paid amounts carry over; a revision billed below what was
  paid escalates.
- A returned payment (bill `oct-12-r1`) keeps the bill PAID; reconciliation flags the return.
- Payout scanner: ignores the vendor's own tax id only behind a tax-id label, and amounts only
  when they equal an amount the bill states; Colombian/Brazilian payout words (Nequi, Daviplata,
  consignar, conta, chave Pix) are keywords.
- Design: concept "la prueba" — the proof bar (billed vs evidenced) and the receiving stamp; Archivo + JetBrains Mono.

## What only you can do

- **LLM credit.** DeepSeek's direct API answers "no balance" for `DEEPSEEK_API_KEY_PRINCIPAL`, and
  the OpenRouter account has about USD 0.29 of USD 5 credit left (it ran out mid-recording).
  Top up either one, then record with `LLM_PROVIDER=openrouter` (or deepseek) — Task 11.
- Create the public GitHub demo repo (e.g. `altamar-labs/app-movil`) with an open PR for the live
  merge moment, and set `GITHUB_REPO`, `GITHUB_DEMO_PR`, optionally `GITHUB_TOKEN` and
  `GITHUB_WEBHOOK_SECRET`.
- Deploy (Railway for API + Postgres, about USD 20/month; web on Vercel Hobby) and record the
  3-minute video once Tasks 9–15 are done.
- The design kit skills impeccable, design-taste-frontend and emil-design-eng were copied to
  `~/.claude/skills/` (marked `.de-diseno-web-kit`) for the UI tasks; remove them when the UI is done.
