# Deploy

Recibido is two processes: the API (`apps/api`, Node + Hono) and the web (`apps/web`, Next.js),
plus a database. The web proxies `/api/*`, `/openapi.json` and `/docs` to `API_URL`, so the browser
only ever talks to the web's origin.

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
| `API_URL`                                      | `http://localhost:4000`           | Where the web proxies the API (resolved at web build time)                                      |

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

### As deployed

<!-- deploy:start -->

_To be completed when the demo is deployed: the web and API URLs, where each runs, the variables
set (names only) and the date._

<!-- deploy:end -->

## Outside demo mode

- `DEMO_MODE=false`, `ADMIN_TOKEN` of at least 24 random characters (the API refuses to start
  without it), `ADMIN_ACTOR` set to the operator's name, `PORTAL_TOKEN_SECRET` set.
- `PUBLIC_WEB_URL` set to the real web origin.
- A managed PostgreSQL with encryption at rest; run one API instance (the decision lock is
  in-process, [ADR-0015](adr/0015-serialized-decisions-per-organization.md)).
- Put an identity provider in front of the web for per-user roles; the admin token is a pilot
  measure ([SECURITY.md](SECURITY.md)).
