# WBMSG — Claude Code Guide

## Project

WhatsApp-first CRM for SMBs globally. GA target: March 2027. Sprint 1 complete.
9 product modules (M1–M9). M1 (Auth) live; M2 (Contacts), M3 (Inbox), M4 (Campaigns) in progress.

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

Local infra (Postgres 16, Redis 7, Meilisearch): `docker compose up -d`

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
  ml/            ML utilities
infra/           Terraform IaC stubs (AWS ECS, RDS, ElastiCache, S3)
```

Key entry points:
- `apps/api/src/routes/` — Fastify route handlers (one file per domain)
- `apps/api/src/lib/` — shared API utilities (prisma, redis, clerk, stripe, ai)
- `apps/api/src/workers/` — BullMQ background workers
- `apps/web/app/` — Next.js App Router pages
- `apps/web/components/` — React components
- `apps/api/prisma/schema.prisma` — database schema

## Architecture

- **Web → API**: Next.js calls Fastify over HTTP REST. Web has no direct DB access.
- **Auth**: Clerk on both web and API. Every API request carries a Clerk JWT validated in `apps/api/src/lib/clerk.ts`.
- **Queue**: BullMQ (Redis) for async jobs — campaign dispatch, contact import, flow execution, conversation summarisation. Workers in `apps/api/src/workers/`.
- **Search**: Meilisearch (port 7700) for full-text search on contacts and conversations.
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
- M5 (AI Agents, S9+) will migrate to the Anthropic Claude API

## Coding Conventions

- **Commits**: `feat(scope): description` / `fix(scope):` / `chore(scope):` — Conventional Commits
- **Branches**: `feat/TRUST-123-description` / `fix/TRUST-456-description` — branch from `develop`, not `main`
- **TypeScript**: strict mode everywhere — no `any`, no implicit returns
- **Imports**: API is ESM-only — use `.js` extensions in imports even for `.ts` source files
- **Logging**: no `console.log` in production — use Fastify logger (`request.log`) or pino
- **Exports**: named exports only in `packages/shared/` — no default exports
- **Tests**: TDD preferred. Vitest for all packages. Run `pnpm test` before opening a PR.
- **PRs**: branch from `develop`, 1 approval + all CI checks required, one feature/fix per PR.

## Module / Sprint Status

| # | Module | Status |
|---|---|---|
| M1 | Auth & Multi-Tenancy | Live |
| M2 | Contact & Lead Management | In progress |
| M3 | WhatsApp Inbox & Conversations | In progress |
| M4 | Template & Campaign Manager | In progress |
| M5 | AI Agents & Automation Builder | Planned (S9+) |
| M6 | Analytics & Reporting | Planned (S11+) |
| M7 | Billing & Subscription | Planned (S13+) |
| M8 | Agency / Sub-Account Mode | Planned (S15+) |
| M9 | Marketplace & Integrations | Planned (S18+) |

## Environment

- `.env` — main vars (git-ignored; copy from `.env.example`)
- `.env.local` — local overrides
- Docker services required: `docker compose up -d` (Postgres 16, Redis 7, Meilisearch)
- Key vars: `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, `META_WHATSAPP_TOKEN`, `STRIPE_SECRET_KEY`
