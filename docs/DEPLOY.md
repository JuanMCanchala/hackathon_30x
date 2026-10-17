# Deploy

Recibido is two processes: the API (`apps/api`, Node + Hono) and the web (`apps/web`, Next.js),
plus a database. The web proxies `/api/*`, `/openapi.json` and `/docs` to `API_URL`, so the browser
only ever talks to the web's origin. A production build without `API_URL` serves the API
in-process instead (the hosted demo, below).

## Configuration

All configuration comes from the environment ([`config.ts`](../apps/api/src/config.ts); names in
[`env.example`](../env.example)). No `.env` file is read by the code; locally, run commands that
need keys with `wallenv run -- <cmd>`.

| Variable                                       | Default                           | Meaning                                                                                         |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PORT`                                         | `4000`                            | API port                                                                                        |
| `DATABASE_URL`                                 | —                                 | PostgreSQL connection string; without it, PGlite under `DATA_DIR`                               |
| `DATA_DIR`                                     | `./.data`                         | PGlite storage                                                                                  |
| `LLM_PROVIDER`                                 | `auto`                            | `auto` (DeepSeek, then OpenRouter), `deepseek`, `openrouter`, `none`                            |
| `DEEPSEEK_API_KEY_PRINCIPAL`, `DEEPSEEK_MODEL` | —, `deepseek-flash`               | DeepSeek V4.1 Flash, direct                                                                     |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`       | —, `deepseek/deepseek-v4.1-flash` | The same model on OpenRouter                                                                    |
| `READER`                                       | `auto`                            | `auto`: recordings, then the live model; `reference`: ground truth (eval only)                  |
| `RECORD`                                       | `false`                           | Write live answers to `packages/dataset/recordings`                                             |
| `DEMO_MODE`                                    | `true`                            | Demo routes, no credentials. `false` requires `ADMIN_TOKEN`                                     |
| `ADMIN_TOKEN`, `ADMIN_ACTOR`                   | —, `Administrador`                | Bearer token (≥ 24 chars) for every write outside demo mode; the name recorded on human actions |
| `PORTAL_TOKEN_SECRET`                          | built-in in demo mode             | Signs the inbox's portal links (≥ 24 chars); set it in any public deployment                    |
| `DEMO_PACE_MS`                                 | `400`                             | Delay between October bills in the tour                                                         |
| `GITHUB_REPO`, `GITHUB_TOKEN`                  | —                                 | Repository polled for the live merge (`owner/name`); token optional (rate limits)               |
| `GITHUB_DEMO_PR`, `GITHUB_WEBHOOK_SECRET`      | —                                 | The PR the M3 milestone waits on; the webhook's HMAC secret                                     |
| `GITHUB_POLL_MS`                               | `5000`                            | Polling interval                                                                                |
| `PUBLIC_WEB_URL`                               | `http://localhost:3000`           | The only CORS origin allowed                                                                    |
| `API_URL`                                      | `http://localhost:4000`           | Where the web proxies the API (web build time); unset in `next build`: the API runs in-process  |

## Local

```bash
pnpm install
pnpm dev                     # web http://localhost:3000, API http://localhost:4000 (docs at /docs)
```

On first start the API seeds Altamar Labs and lives through September (October 1, 08:00). The
data persists in `.data/` (PGlite); **Recorrido → Reiniciar la demo** resets it. To have the model
read new uploads:

```bash
LLM_PROVIDER=deepseek wallenv run -- pnpm dev
```

Checks: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm eval && pnpm build`.

## Docker Compose (PostgreSQL)

```bash
docker compose up --build    # db (postgres:17), api (:4000), web (:3000)
```

[`docker-compose.yml`](../docker-compose.yml) builds both images from the repository root
([`apps/api/Dockerfile`](../apps/api/Dockerfile), [`apps/web/Dockerfile`](../apps/web/Dockerfile)),
waits for PostgreSQL and for the API's health check, and passes keys through only if you set them
in your shell. The API image bundles the migrations, the demo documents and the recordings, runs
as the `node` user and exposes `GET /api/v1/health`.

## Vercel (web) + an API host

The web is a standard Next.js app with `output: 'standalone'`:

1. Import the repository in Vercel, root directory `apps/web`, framework Next.js. Install command
   `pnpm install --frozen-lockfile` (pnpm workspace at the root).
2. Set `API_URL` to the API's public URL **before** building (rewrites are resolved at build time).
3. Set the API's `PUBLIC_WEB_URL` to the Vercel URL (CORS).

The API needs a long-running Node process (GitHub polling, the background October arrival), so it
runs on a container host. With Railway: a service from `apps/api/Dockerfile`, a PostgreSQL plugin
whose URL goes into `DATABASE_URL`, `DEMO_MODE=true` for the public demo (or `false` with an
`ADMIN_TOKEN`), and `PORTAL_TOKEN_SECRET`. Cost: [README → Monthly cost](../README.md#monthly-cost).

For the live GitHub moment, point a repository webhook (`Pull requests`, JSON, secret
`GITHUB_WEBHOOK_SECRET`) at `<API>/api/v1/webhooks/github`, and set `GITHUB_REPO` and
`GITHUB_DEMO_PR` to an open PR. Without them, the tour simulates the merge.

### The hosted demo (one Vercel project)

The public demo runs as a single Vercel project: the Next.js web with the API embedded in a route
handler, PGlite in memory, and the demo seeded on cold start. Its state lives in the function
instance, so it can reset when Vercel recycles the instance; **Recorrido → Reiniciar la demo**
puts it back at October 1 at any time. It needs no keys (recorded readings). This is a demo
setup, not a production one: Docker Compose or Railway with PostgreSQL (above) remain the
production path.

How it is built:

- [`apps/web/app/api/[...path]/route.ts`](../apps/web/app/api/[...path]/route.ts) (plus
  `app/docs` and `app/openapi.json`) hand each request to
  [`createEmbeddedApi`](../apps/api/src/embedded.ts): the same Hono app, container and demo
  service as the API server, on in-memory PGlite, created once per instance and reset to
  October 1 before the first request is answered. Node runtime, `maxDuration` 60 s,
  `force-dynamic`; `after()` keeps the instance alive while the October bills arrive.
- Without `API_URL` at build time, `next.config.ts` drops the rewrites and traces the migrations,
  `packages/dataset/{files,recordings}` and PGlite's WASM into these functions
  (`outputFileTracingIncludes`; PGlite is a `serverExternalPackages` entry). `MIGRATIONS_DIR`
  and `DATASET_DIR` point the API at them. With `API_URL` (Docker, `pnpm dev`) the rewrites run
  before these route handlers, so nothing changes there.
- Vercel may answer one visitor's requests from different instances. The visitor carries the
  tour in a cookie (`recibido-tour`: the tour actions since their last reset), and an instance
  at another step replays it first: a reset and each action, the arrival without pauses (a few
  seconds, once per instance). Ids are sequential from each reset, so the replay assigns the
  same ids and open links keep working.
- Project settings ([`apps/web/vercel.json`](../apps/web/vercel.json)): root directory
  `apps/web`, Node 24.x, install `pnpm install --frozen-lockfile` and build
  `pnpm --filter @recibido/web build` with the repository's pnpm (12.9.1, through `npx`).

### As deployed

<!-- deploy:start -->

- **URL:** <https://recibido.vercel.app> (web, API at `/api/v1`, reference at `/docs`), deployed
  2026-10-17 from `feat/recibido` with `vercel deploy --prod` (no Git integration).
- **Where:** one Vercel project `recibido` (Hobby, region `iad1`, Fluid compute), public: no
  deployment protection.
- **Variables (production):** `DEMO_MODE`, `DEMO_PACE_MS`, `READER`, `PUBLIC_WEB_URL`. No keys:
  every reading comes from the recordings, so an upload the recordings do not cover escalates
  as unreadable.
- **Limits:** state is per instance and in memory. A cold start takes about 2 s plus Vercel's own
  start (up to about 10 s the first time); an instance that idles is recycled and comes back at
  October 1 (or at the visitor's tour step, from the cookie). Uploads, a person's decisions and
  portal replies outside the tour live only in the instance that received them. Visitors on
  different tour steps who share an instance make it replay on each switch. No GitHub live
  merge (simulated); no background polling.

<!-- deploy:end -->

## Outside demo mode

- `DEMO_MODE=false`, `ADMIN_TOKEN` of at least 24 random characters (the API refuses to start
  without it), `ADMIN_ACTOR` set to the operator's name, `PORTAL_TOKEN_SECRET` set.
- `PUBLIC_WEB_URL` set to the real web origin.
- A managed PostgreSQL with encryption at rest; run one API instance (the decision lock is
  in-process, [ADR-0015](adr/0015-serialized-decisions-per-organization.md)).
- Put an identity provider in front of the web for per-user roles; the admin token is a pilot
  measure ([SECURITY.md](SECURITY.md)).
