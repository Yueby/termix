# Termix server

Optional. The app keeps everything locally on its own; this exists so several machines can
share one vault.

You deploy it yourself. It is not a hosted service, and there are no accounts — one shared
token is the entire access model, because a private deployment belongs to one person and
there is no second account for anything to be kept apart from.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `TERMIX_TOKEN` | yes | The shared secret every client sends. Generate with `openssl rand -hex 32`. |
| `DB_PATH` | no | SQLite file, Node build only. Defaults to `./data/termix.db`. |
| `PORT` | no | Defaults to `3000`. |
| `CORS_ORIGIN` | no | Comma-separated list. Defaults to `*`, which is fine here: the API is token-authenticated and sets no cookies. |

## Docker

```sh
export TERMIX_TOKEN=$(openssl rand -hex 32)
docker compose -f packages/server/docker-compose.yml up -d
```

Run it from the repository root. The compose file builds with the repository as its context
because pnpm needs the lockfile and the workspace manifest, which live there rather than
beside the server package.

The image is not built in CI, so build it once before relying on it.

## Cloudflare Workers + D1

```sh
cd packages/server
wrangler d1 create termix-db             # put the returned id into wrangler.toml
wrangler d1 migrations apply termix-db   # add --local to rehearse it against a local database
wrangler secret put TERMIX_TOKEN
wrangler deploy
```

The migrations are Drizzle's output under `drizzle/`, and `wrangler.toml` points
`migrations_dir` at that directory, so there is one set of migration files rather than a copy
per tool.

About the free plan: Workers Free allows 10 ms of CPU per request, and Cloudflare's own
documentation puts authentication at 10–20 ms. This server deliberately does no password
hashing — comparing a token is not the expensive part — so it fits comfortably. That is the
same reason there is no account system to pay for.

## Connecting the app

**Settings → Sync → Sync Backend → Self-hosted server**, then the URL and the same token.
Leave the backend set to Off to keep everything local, or choose WebDAV if you would rather
sync to storage you already have.

## What it stores

One row: the client encrypts the vault with the sync password before sending it, so the server
holds something it cannot read. It never sees a host's password, a private key, or a snippet.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Unauthenticated, so a deployment check can tell "up" from "wrong token". |
| `GET` | `/sync/status` | The stored version and when it changed. |
| `GET` | `/sync/pull` | `{ data, version }`, or `data: null` for a vault that has never been pushed. |
| `POST` | `/sync/push` | `{ data, version }`. `409` with `serverVersion` if the stored version is not older. |

Every `/sync` route needs `Authorization: Bearer <TERMIX_TOKEN>`.

## Tests

```sh
pnpm --filter @termix/server test       # request-level, against the real migrations
pnpm --filter @termix/server typecheck  # both runtimes: Node and Workers
```
