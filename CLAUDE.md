# WBMSG — Claude Code Instructions

> Full context, DB schema, sprint plan: `docs/PROJECT_REFERENCE.md`

## Project

WhatsApp-first CRM for India's SMBs. All 24 sprints complete — GA-ready April 2026.
Multi-tenant SaaS (shared PostgreSQL + RLS). Monorepo: Turborepo + pnpm workspaces.

## Apps & Packages

| Name | Path | Stack |
|------|------|-------|
| `@WBMSG/api` | `apps/api` | Fastify 4, ESM, Node 20, Prisma, BullMQ |
| `@WBMSG/web` | `apps/web` | Next.js 15 App Router, Tailwind, React Query |
| `@WBMSG/mobile` | `apps/mobile` | Expo 51, React Native 0.74 |
| `@WBMSG/shared` | `packages/shared` | Branded types, constants (ESM-only) |
| `@WBMSG/tsconfig` | `packages/tsconfig` | Shared TS base configs |
| `@WBMSG/eslint-config` | `packages/eslint-config` | ESLint 8 shared config |
| `ml-service` | `services/ml` | Python 3.11 + FastAPI (port 8000) |

## Key Commands

```bash
pnpm install                        # install all deps
pnpm dev                            # run all apps (turbo)
pnpm build                          # build all
pnpm type-check                     # typecheck all
pnpm lint                           # lint all
pnpm test                           # test all
pnpm clean                          # clean all

pnpm --filter @WBMSG/api dev        # run api only
pnpm --filter @WBMSG/web dev        # run web only (port 3000)
pnpm --filter @WBMSG/api test       # test api only
pnpm --filter @WBMSG/api generate   # prisma generate
```

## Integrations & Services

**Auth:** Clerk (`@clerk/backend` API, `@clerk/nextjs` web, `@clerk/clerk-expo` mobile)
**DB:** PostgreSQL 16 + Prisma ORM — all DB access via Prisma, never raw SQL except RLS policies
**Cache/Queue:** Redis 7 + BullMQ workers (campaign, contact-import, flow, inbound-message)
**Search:** Meilisearch v1.8
**WhatsApp:** Meta WhatsApp Cloud API (`apps/api/src/lib/whatsapp.ts`, `meta-templates.ts`)
**AI:** Anthropic Claude API (`lib/claude.ts`), OpenAI Whisper (`lib/whisper.ts`), ElevenLabs
**Billing:** Stripe (`lib/stripe.ts`)
**Observability:** Sentry + Datadog + PagerDuty
**Email:** Resend + Amazon SES
**Storage:** AWS S3 / Cloudflare R2

## API Structure (`apps/api/src/`)

```
index.ts          server entry
lib/              claude, whatsapp, prisma, redis, queue, search, stripe, clerk, …
plugins/          auth, prisma, rate-limit, sentry, socketio, swagger
routes/           ai, analytics, billing, campaigns, chatbots, contacts, conversations,
                  deals, flows, messages, segments, templates, webhooks, …
workers/          campaign, contact-import, flow, inbound-message
types/            fastify.d.ts (type augmentation)
```

## Web Structure (`apps/web/`)

```
app/
  (auth)/         sign-in, sign-up
  (dashboard)/    campaigns, contacts, companies, deals, flows, inbox, …
  (onboarding)/   onboarding flow
  api/            Next.js route handlers
components/       analytics, contacts, deals, flows, inbox, ui, …
hooks/            custom React hooks
lib/              utilities
middleware.ts     Clerk auth middleware
```

## Gotchas

**ESM (`apps/api`)** — `"type":"module"`; all imports need `.js` extension; tsconfig must use `"module":"Node16","moduleResolution":"Node16"` — never `bundler` for Node servers. `@WBMSG/shared` is ESM-only.

**Next.js imports** — do NOT add `.js` extensions; webpack resolves them automatically.

**TypeScript** — `strict:true` everywhere; never commit `*.tsbuildinfo`; add explicit `JSX.Element` return types to avoid TS2742; no `any` types.

**ESLint** — v8 only (`eslint ^8.57.1`); never upgrade to v9 (breaks `@typescript-eslint/eslint-plugin` v7).

**pnpm** — never npm/yarn; pinned `pnpm@10.33.2`; Node `>=20 <23`; Windows EPERM → `npm install -g pnpm`.

**Testing** — Vitest; always `Fastify({logger:false})` in tests; use `app.inject()` not real HTTP; test files sit beside routes as `*.test.ts`.

**Branded IDs** — `type ContactId = string & {readonly __brand:"ContactId"}` — never plain `string`. All domain IDs live in `packages/shared/src/index.ts`.

**Turbo** — `lint`/`type-check` depend on `^lint`/`^type-check` (not `^build`); `test` depends on `^build`; `dev` is persistent + no cache.

**Git** — Conventional Commits: `feat(api): add endpoint` · branch: `feat/TRUST-123-description`.

**Prisma** — run `pnpm --filter @WBMSG/api generate` after any schema change; client lives in `apps/api/src/lib/prisma.ts`.

**Socket.io** — real-time via `apps/api/src/plugins/socketio.ts`; client in `apps/web/` uses `socket.io-client`.

## Docker (local dev infrastructure)

```bash
docker compose up -d               # start all local services
docker compose --profile observability up -d  # + Datadog agent
```

| Service | Image | Port |
|---------|-------|------|
| postgres | postgres:16-alpine | 5432 |
| redis | redis:7-alpine | 6379 |
| meilisearch | meilisearch:v1.8 | 7700 |
| ml-service | services/ml/Dockerfile | 8000 |
| dd-agent | datadog/agent | 8126 (observability profile) |

## Deployment

**API → Railway** — Docker build via `apps/api/Dockerfile`; config in `railway.toml` (repo root)
**Web → Vercel** — project root is `apps/web`; build config lives in `apps/web/vercel.json` (NOT repo-root `vercel.json`)

### Production URLs & IDs

| | Value |
|--|-------|
| API public URL | `https://trustcrmapi-production.up.railway.app` |
| API internal URL | `trustcrmapi.railway.internal` |
| Web URL | `https://trustcrm-web-conveysproject-7758s-projects.vercel.app` |
| Railway project | `focused-forgiveness` · environment: `production` |
| Railway service name | `@trustcrm/api` (ID: `421b2efd-ea6d-4eb3-9b37-f507d56a9ac2`) |
| Vercel project | `trustcrm-web` (ID: `prj_g88r1mFO3xWc5BmjIfTRUXT0ZJ4z`) |

Railway also runs: **Redis** · **Meilisearch** · **Postgres** (all on internal railway.internal hostnames).

### Railway CLI — verified working commands

> Start every session by linking the service — otherwise `service logs` / `variable` fail.

```bash
railway whoami                              # confirm auth (conveysproject@gmail.com)
railway status                             # project + environment info
railway service status --all               # list ALL services with status (BUILDING/SUCCESS/etc)
railway service link "@trustcrm/api"       # link CLI to the API service (required once per session)
railway variable                           # list env vars for linked service
railway service logs --lines 100           # pull last 100 log lines (no streaming)
railway service logs                       # stream live logs
railway service logs --filter "@level:error" --lines 50   # errors only
railway service logs --http --status ">=400" --lines 50   # HTTP 4xx/5xx only
railway service logs --build               # build/deploy logs
railway redeploy                           # redeploy latest build
railway up                                 # build + deploy from local directory
railway open                               # open dashboard in browser
railway run <cmd>                          # run command with production env vars
```

**Dead commands — do NOT use:**
- `railway ps` — unrecognized subcommand
- `railway service list` — does not exist; use `railway service status --all`
- `railway logs --service <name>` — use `railway service link` then `railway service logs`
- `railway variables` — use `railway variable` (no s)

### Vercel CLI — verified working commands

```bash
vercel whoami                              # confirm auth
vercel ls                                  # list all deployments (most recent first)
vercel project inspect trustcrm-web        # show project settings incl. build command
vercel inspect --logs <deployment-id>      # full build logs for a specific deployment
vercel env ls                              # list all env vars
vercel env add <NAME>                      # add/update an env var
vercel env pull .env.vercel.local          # pull env vars to local file
vercel redeploy <deployment-url>           # redeploy a specific deployment
```

**Get deployment ID from `vercel ls`** — format is `dpl_xxxx`, shown in the `inspect` output.
