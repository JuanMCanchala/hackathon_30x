# Recibido

30X Hackathon entry for the **Blinka — Agentes que pagan por la empresa** challenge. Read `docs/PROPOSAL.md` first: it is the
approved design. Deadline: Sunday 2026-10-18, 12:00 Colombia (UTC-5).

## Context

- Hackathon facts are in `docs/PROPOSAL.md` section 1. If present, `contexto-hackathon.md` at the
  repo root (local, untracked) has the full summary of the hackathon livestreams.
- Reference project: **Mandato**, branch `feat/mandato` (worktree `../30x-mandato`, or
  `git show feat/mandato:<path>`). It is the bar for engineering, docs and finish. Before
  planning, read its `README.md`, `docs/SYSTEM_DESIGN.md`, `docs/DEMO.md`, `docs/adr/` and
  `apps/web`. Reuse its stack and its good patterns: record and replay of model calls, eval
  harness as a CI gate, a receipt per decision, guided demo with one-click reset. Do not copy its
  concept or its visual identity.

## Rules

- Language: code, docs, comments and commits in English. User-facing UI in Spanish (LatAm users
  and jury), with correct accents.
- Secrets: never in code or commits. Read them from the environment; `env.example` lists names
  only. Run commands that need keys with `wallenv run -- <cmd>`. Available keys:
  `DEEPSEEK_API_KEY_PRINCIPAL`, `OPENROUTER_API_KEY`. Never read `.env` files.
- Git: work only on this branch and in this worktree. Commit small and often (Conventional
  Commits). No co-author or tool attribution lines in commits. Never push, never deploy, never
  touch other branches or worktrees.
- Subagents: research and mechanical work run with model `sonnet`, briefs in English. Do not use
  claude-in-chrome or agent-browser (they hang when unattended); use WebSearch and WebFetch.
- Web design: invoke the `diseno-web` skill before building the landing or the UI. When it asks
  whether to research online, choose no research and use the installed kit (impeccable +
  design-taste-frontend, plus emil-design-eng for motion). Give the product its own visual
  concept: one strong protagonist, a clean rest, nothing that looks generic. At least Mandato's
  level of finish. Turn the kit skills off when done (the skill explains how).
- Visual checks: Playwright screenshots at 390 px and 1440 px (a small script or
  `npx playwright screenshot`).
- Verify before claiming anything works: typecheck, lint, tests, build, eval, screenshots.
- Safety first: the language model never decides a payment; code does. Any change that could let
  an improper payment through needs a test that proves it cannot.

## Definition of done

- The demo in `docs/PROPOSAL.md` section 7 runs end to end on a fresh clone, with a one-click
  reset and a guided tour, and works without API keys (recorded responses).
- An eval command over labeled data; its results in the README.
- README: what and why, architecture (mermaid), how to run, security measures, monthly cost with
  the arithmetic, results, known limits.
- Vitest suites and one E2E test of the demo path pass; CI workflow in `.github/workflows`.
- Dockerfile and/or Vercel config ready, not deployed.
- `docs/STATUS.md`: what works, what is pending, the decisions you made, and what only the user
  can do (keys, deploy, video).
