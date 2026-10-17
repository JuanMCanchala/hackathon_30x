# Running and deploying Mandato

Three ways to run it, from zero infrastructure to a hosted demo. In every case the web app is the
only public entry point a person needs: it proxies `/api/*` to the API.

## 1. Local, no Docker (PGlite)

Requirements: Node.js 24 (≥ 22.12 works) and pnpm 12 (`npm i -g pnpm@12`).

```bash
pnpm install
cp env.example .env          # the API and its scripts read it
pnpm dev                     # API on :4000, web on :3000
```

- The database is PGlite persisted under `.data/`; delete the folder to start over, or use
  _Recorrido guiado → Reiniciar la demo_.
- In demo mode the API seeds Andes Labs on first start (31 July 2026). The guided tour runs
  August and September; the attack lab and the live files use today's date.
- **Choose the reader** (`READER` in `.env`):
  - `auto` (default): Claude's recorded extractions are replayed, and with `ANTHROPIC_API_KEY`
    any other document is read by Claude live. Without a key and without recordings, a document
    nobody can read is escalated as unreadable — deny-by-default.
  - `reference`: the dataset's ground truth reads the demo documents. For development and
    evaluation without a key; the interface labels it as such.

To record Claude's readings of the 48 dataset documents once (about 48 requests to
`claude-opus-5-5`) and commit them, so every later run replays them without a key:

```bash
# ANTHROPIC_API_KEY set in .env
pnpm extractions:record          # only the missing ones; --force re-records all
pnpm eval --require-replay       # end-to-end run on the recorded readings
```

## 2. Docker Compose (PostgreSQL)

```bash
docker compose up --build                                   # http://localhost:3000
ANTHROPIC_API_KEY=… READER=auto docker compose up --build   # Claude reads every document
```

Compose runs PostgreSQL 17, the API (migrations run on start) and the web app. `WEB_PORT`,
`API_PORT` and `PUBLIC_WEB_URL` change the published ports and the base of approval links.

## 3. Railway (or any container platform)

Three services from this repository:

| Service  | Source                                    | Variables                                                                                                                                                                              |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres | Railway's PostgreSQL                      | —                                                                                                                                                                                      |
| api      | `apps/api/Dockerfile`, root directory `/` | `DATABASE_URL` (reference to Postgres), `PORT=4000`, `DEMO_MODE=true`, `APPROVAL_LINK_SECRET` (long random), `PUBLIC_WEB_URL` (the web's public URL), `ANTHROPIC_API_KEY` and `READER` |
| web      | `apps/web/Dockerfile`, root directory `/` | `API_URL` = the API's private address, e.g. `http://api.railway.internal:4000`                                                                                                         |

Things that bite:

- **`API_URL` is a build-time value.** Next.js resolves rewrites when it builds, so the web image
  must be built with it (`--build-arg API_URL=…`; Railway passes service variables to `ARG`s).
  Changing it means rebuilding the web service.
- **Approval links** are built from `PUBLIC_WEB_URL` and signed with `APPROVAL_LINK_SECRET`;
  rotating the secret invalidates the links already sent.
- **Live updates** use server-sent events; the API marks the stream `no-transform` and
  `X-Accel-Buffering: no` so proxies pass it through. If a proxy still buffers, screens still refresh when the
  tab regains focus and the pending counts every 30 seconds.
- Only the web service needs a public domain. Expose the API too if external agents will call
  `/agent/v1/*` directly (the MCP server does).

## Before production

The demo is a demo. Before real money:

- Set `DEMO_MODE=false`. User endpoints then refuse every request until an identity provider is
  wired in front of the API (`x-mandato-user` is demo-only); agent keys and approval links keep
  working because they are capabilities.
- Replace the simulated exchange rates with a rates feed that versions every change (ADR-0007).
- Connect a `PaymentRail` for Blinka's API, Bre-B, SPEI or Pix that consumes `PAID` and
  `APPROVED` bills; Mandato decides, it does not move money.
- Move documents to object storage behind the `DocumentStore` port, and the in-process event bus
  to PostgreSQL `LISTEN/NOTIFY` before running more than one API instance.
- Review [SECURITY.md](SECURITY.md).
