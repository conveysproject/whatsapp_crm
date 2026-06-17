# WBMSG — Claude Code Guide

## Project

WhatsApp-first CRM for SMBs globally. © 2026 WBMSG.
9 product modules (M1–M9). M1 live; M2–M4 in progress; M5–M9 planned.

**Production:** Web → [wbmsg.com](https://wbmsg.com) · API → wbmsg-production.up.railway.app

## Tech Stack

| Layer | Technology |
|---|---|
| API | Fastify 4, Node.js 24.x, TypeScript, Socket.io |
| Web | Next.js 15 (App Router), React 18, Tailwind CSS |
| Mobile | React Native 0.74.1 + Expo 51 |
| Database | PostgreSQL 16 + Prisma 7 |
| Cache / Queue | Redis 7 + BullMQ |
| Auth | Clerk |
| AI | OpenAI (gpt-4o-mini) |
| Storage | Cloudflare R2 |
| Payments | Stripe |
| Monitoring | Sentry |
| Deploy | Railway (API) · Vercel (Web) |

## Quick Commands

```bash
pnpm dev              # start all apps (Turbo parallel)
pnpm test             # run all tests (Vitest)
pnpm lint             # ESLint all packages
pnpm type-check       # TypeScript check all packages
pnpm build            # build all packages

# Scoped to one app:
pnpm --filter @WBMSG/api     <cmd>
pnpm --filter @WBMSG/web     <cmd>
pnpm --filter @WBMSG/mobile  <cmd>
pnpm --filter @WBMSG/shared  <cmd>
```

Local infra (Postgres 16, Redis 7): `docker compose up -d`

## Repository Map

```
apps/
  api/      Fastify 4 REST API — port 4000, ESM, TypeScript strict
  web/      Next.js 15 App Router — port 3000
  mobile/   React Native + Expo 51
  conveys/  Marketing / landing site (Next.js)
packages/
  shared/        Branded domain types, API response types, constants
  tsconfig/      Shared TypeScript base configs
  eslint-config/ Shared ESLint 8 config
services/
  ml/       ML service — Python / FastAPI
```

Key entry points:
- `apps/api/src/routes/` — Fastify route handlers (one file per domain)
- `apps/api/src/lib/` — shared API utilities (prisma, redis, clerk, stripe, ai)
- `apps/api/src/workers/` — BullMQ background workers
- `apps/web/app/` — Next.js App Router pages
- `apps/web/components/` — React components
- `apps/api/prisma/schema.prisma` — database schema

## Architecture

- **Web → API**: Next.js calls Fastify over HTTP REST + Socket.io for real-time. Web has no direct DB access.
- **Auth**: Clerk on both web and API. Every API request carries a Clerk JWT validated in `apps/api/src/lib/clerk.ts`.
- **Queue**: BullMQ (Redis) for async jobs — campaign dispatch, contact import, flow execution, conversation summarisation. Workers in `apps/api/src/workers/`.
- **Storage**: Cloudflare R2 for media and file uploads.
- **Multi-tenant**: Every DB model has `organizationId`. **Always scope Prisma queries to it — never query cross-org.**

## Database / Prisma

- Schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
- Run migration: `npx prisma migrate dev --name <name>` (from repo root — `prisma.config.js` points to `apps/api`)
- Regenerate client: `npx prisma generate`
- Key models: `Organization`, `User`, `Contact`, `Conversation`, `Message`, `Campaign`, `Flow`, `Template`
- **Critical**: never omit `organizationId` from a Prisma `where` clause — all data is org-scoped.

## AI Integration

- AI helpers: `apps/api/src/lib/claude.ts` — despite the filename, uses **OpenAI gpt-4o-mini** (not Anthropic)
- Functions: `generateSuggestions`, `detectIntent`, `analyzeSentiment`, `generateSmartReplies`, `summarizeConversation`, `buildAiContext`
- RAG helpers: `apps/api/src/lib/ai-rag.ts`
- Context window: 6 messages when `Contact.pastAiSummary` exists (`AI_CONTEXT_SHORT`); 30 messages otherwise (`AI_CONTEXT_LONG`)
- Summaries refreshed by `apps/api/src/workers/conversation-summary.worker.ts`

## Coding Conventions

- **Commits**: `feat(scope): description` / `fix(scope):` / `chore(scope):` — Conventional Commits
- **Branches**: `feat/WBMSG-123-description` / `fix/WBMSG-456-description` — branch from `develop`, not `main`
- **TypeScript**: strict mode everywhere — no `any`, no implicit returns
- **Imports**: API is ESM-only — use `.js` extensions in imports even for `.ts` source files
- **Logging**: no `console.log` in production — use Fastify logger (`request.log`) or pino
- **Exports**: named exports only in `packages/shared/` — no default exports
- **Tests**: TDD preferred. Vitest for all packages. Run `pnpm test` and `pnpm lint` before opening a PR.
- **PRs**: branch from `develop`, 1 approval + all CI checks required, one feature/fix per PR.

## Module Status

| # | Module | Status |
|---|---|---|
| M1 | Auth & Multi-Tenancy | Live |
| M2 | Contact & Lead Management | In Progress |
| M3 | WhatsApp Inbox | In Progress |
| M4 | Template & Campaign Manager | In Progress |
| M5 | AI Agents & Automation | Planned |
| M6 | Analytics & Reporting | Planned |
| M7 | Billing & Subscription | Planned |
| M8 | Agency / Sub-Account Mode | Planned |
| M9 | Marketplace & Integrations | Planned |

## Environment

- `.env` — main vars (git-ignored; copy from `.env.example`)
- Docker services required: `docker compose up -d` (Postgres 16, Redis 7)
- Key API vars: `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`, `WA_WEBHOOK_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- Key Web vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_REDIRECT_URI`
