# Runbook: local stack in wbmsg (own auth) mode

Runs the API and web app against a throwaway Docker Postgres and Redis with the
WBMSG own-auth provider, and runs the Playwright end-to-end spec against it.

Safety: everything here targets `localhost`. Never point `DATABASE_URL` at
production (Railway) and never run `prisma migrate deploy` against it. Production
stays on Clerk (`AUTH_PROVIDER` and `NEXT_PUBLIC_AUTH_PROVIDER` unset).

> **Lessons from the first real run (2026-10-17) — read first**
> - `docker-compose.yml` now requires `POSTGRES_PASSWORD` (no hardcoded passwords). If your own dev stack (`WBMSG_postgres`, `WBMSG_redis`, API on 4000, web on 3000) is already running, do **not** reuse it: start throwaway containers instead, e.g.
>   `docker run -d --name wbmsg-e2e-pg -e POSTGRES_USER=WBMSG -e POSTGRES_PASSWORD=<random> -e POSTGRES_DB=WBMSG_e2e -p 5434:5432 postgres:16-alpine` and
>   `docker run -d --name wbmsg-e2e-redis -p 6380:6379 redis:7-alpine`, then use ports 5434/6380 in `.env`, `API_PORT=4100`, `CORS_ORIGIN=http://localhost:3100`, web on `--port 3100`, and `E2E_BASE_URL=http://localhost:3100`.
> - `prisma migrate deploy` cannot build a fresh database (the migration history has out-of-band gaps). On the throwaway DB use `npx prisma db push` instead (empty database only; never against production).
> - Run the web app as a production build (`npx next build` then `npx next start --port 3100`): `next dev` compiles pages for 10–45 s on first hit, longer than the test timeouts. This also proves the build works with no Clerk keys.
> - Install the Playwright browser once: `npx playwright install chromium`. Add `--headed --workers=1` to watch the run.
> - Teardown: `docker rm -f wbmsg-e2e-pg wbmsg-e2e-redis` and delete the API log (it holds one-time codes).

## 1. Start Docker and the data services

1. Start Docker Desktop and wait until it reports "running".
2. From the repo root start only the two services the auth flow needs:

   ```
   docker compose up -d postgres redis
   ```

   Postgres listens on 5432 (user `WBMSG`, password `WBMSG`, db `WBMSG_dev`),
   Redis on 6379. For a clean slate use `docker compose down -v` first (drops
   the volumes).

## 2. API environment

Create `apps/api/.env` (gitignored; the API loads it with `dotenv/config` from
the directory you run it in). Set these names:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `development` |
| `AUTH_PROVIDER` | `wbmsg` |
| `AUTH_DEV_LOG_CODES` | `1` (dev-only: logs `[dev-code] <purpose> <email> <code>` so the e2e can read codes; ignored when `NODE_ENV=production`) |
| `DATABASE_URL` | `postgresql://WBMSG:WBMSG@localhost:5432/WBMSG_dev` |
| `REDIS_URL` | `redis://localhost:6379` |
| `AUTH_JWT_PRIVATE_KEY`, `AUTH_JWT_KID` | from the key generator below |
| `AUTH_CODE_PEPPER` | random string of 32+ characters |
| `AUTH_BFF_SECRET` | random string of 32+ characters; must equal the web value |
| `CORS_ORIGIN` | `http://localhost:3000` (default) |

Leave `WEB_URL` and `INTERNAL_EMAIL_SECRET` unset: mail sending is then skipped
and the code is only available from the log.

Generate the signing key (prints env lines; writes no files):

```
cd apps/api
npx tsx scripts/gen-auth-keys.ts
```

Paste the `AUTH_JWT_PRIVATE_KEY` and `AUTH_JWT_KID` lines into `.env`. Generate a
32+ character secret for the pepper and the BFF secret (use a different value
for each). `AUTH_BFF_SECRET` must be 32+ characters on BOTH Vercel and Railway
(and equal on both); a shorter value is ignored by the API:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Migrate the Docker database

Only against the Docker database from step 1 (fresh volume):

```
cd apps/api
npx prisma migrate deploy
```

Check that `DATABASE_URL` is the `localhost:5432/WBMSG_dev` one first, and unset any
shell-exported `DATABASE_URL` before `prisma migrate deploy` (an exported value
overrides `.env`).

## 4. Start the API, piping stdout to a log file

The e2e reads one-time codes from this file. Pick any path and use it as
`E2E_API_LOG` in step 6.

PowerShell:

```
cd apps/api
npx tsx src/index.ts *> "$env:TEMP\wbmsg-api.log"
```

Git Bash:

```
cd apps/api
npx tsx src/index.ts > /tmp/wbmsg-api.log 2>&1
```

Wait for `http://localhost:4000/health` to answer. Use `tsx` without `watch` so
a restart does not truncate the log mid-run. The log contains one-time codes:
keep it local and delete it afterwards.

## 5. Web environment and start

Create `apps/web/.env.local` (gitignored) with these names:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `wbmsg` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |
| `API_URL` | `http://localhost:4000` |
| `AUTH_BFF_SECRET` | same value as in the API `.env` |
| `AUTH_JWKS_URL` | optional; defaults to `${API_URL}/v1/auth/.well-known/jwks.json` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | leave unset (no captcha locally) |

Then:

```
cd apps/web
npx next dev --port 3000
```

## 6. Run the end-to-end spec

In a new terminal, from `apps/web`:

PowerShell:

```
$env:E2E_AUTH_PROVIDER = "wbmsg"
$env:E2E_API_LOG = "$env:TEMP\wbmsg-api.log"
npx playwright test e2e/tests/auth-wbmsg.spec.ts
```

Git Bash:

```
E2E_AUTH_PROVIDER=wbmsg E2E_API_LOG=/tmp/wbmsg-api.log npx playwright test e2e/tests/auth-wbmsg.spec.ts
```

In wbmsg mode the Playwright config runs headless, uses no stored Clerk session,
skips the Clerk global setup, and does not start servers itself (steps 4 and 5
do). Without `E2E_AUTH_PROVIDER=wbmsg` the spec is skipped. Each run uses new
`e2e-...@example.com` accounts; the report is in `apps/web/playwright-report`.

## 7. Teardown

1. Stop the web and API processes (Ctrl+C).
2. Delete the log file (it holds codes).
3. `docker compose down` (add `-v` to also drop the database and Redis data).
4. Remove the `AUTH_*` lines from `apps/web/.env.local` and `apps/api/.env` if
   you want the default Clerk mode back.
