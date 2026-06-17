# Claude Code Setup — Design Spec

**Date:** 2026-06-17
**Project:** WBMSG (WhatsApp CRM)
**Scope:** CLAUDE.md + `.claude/settings.json` + custom slash commands

---

## Goal

Give Claude Code rich project context and pre-configured tooling so every session in this monorepo starts informed and frictionless — no repeated explanations of stack or conventions, no permission prompts for standard commands.

---

## 1. CLAUDE.md

Single file at repo root. Sections ordered by how frequently Claude needs them mid-task.

### 1.1 Project identity
- Name: WBMSG — WhatsApp-first CRM for SMBs globally
- GA target: March 2027 · Status: Sprint 1 complete
- 9 product modules (M1–M9), see sprint map below

### 1.2 Quick commands
Exact pnpm/turbo commands for daily operations:
- `pnpm dev` — start all apps (Turbo parallel)
- `pnpm test` — run all tests (Vitest)
- `pnpm lint` — ESLint all packages
- `pnpm type-check` — TypeScript check all packages
- `pnpm build` — build all packages
- `pnpm --filter @WBMSG/<app> <cmd>` — scope to one app

### 1.3 Repository map
```
apps/
  api/      Fastify 4 REST API — port 4000, ESM, TypeScript
  web/      Next.js 15 App Router — port 3000
  mobile/   React Native + Expo 51
  conveys/  Marketing / landing site (Next.js)
packages/
  shared/       Branded domain types, API response types, constants
  tsconfig/     Shared TypeScript base configs
  eslint-config/ Shared ESLint 8 config
  ml/           ML utilities
services/       External service integrations
infra/          Terraform IaC stubs (AWS ECS, RDS, ElastiCache, S3)
```

Key entry files:
- API: `apps/api/src/routes/` (route handlers), `apps/api/src/lib/` (shared utilities), `apps/api/src/workers/` (BullMQ workers)
- Web: `apps/web/app/` (Next.js App Router pages), `apps/web/components/` (React components)
- Prisma schema: `apps/api/prisma/schema.prisma`

### 1.4 Architecture
- Web (Next.js) calls API (Fastify) over HTTP REST — no direct DB access from web
- Clerk handles auth on both web and API; every API request carries a Clerk JWT
- BullMQ (Redis) powers async jobs: campaign dispatch, contact import, flow execution, conversation summarisation
- Meilisearch provides full-text search (contacts, conversations) — port 7700
- Multi-tenant: every DB model carries `organizationId` — always scope queries to it

### 1.5 Database / Prisma
- Schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
- Run migrations: `npx prisma migrate dev --name <name>` from repo root (prisma.config.js points to apps/api)
- Regenerate client: `npx prisma generate`
- Multi-tenant key field: `organizationId` — **never query without this filter**
- Key top-level models: `Organization`, `User`, `Contact`, `Conversation`, `Message`, `Campaign`, `Flow`, `Template`

### 1.6 AI integration
- AI helpers live in `apps/api/src/lib/claude.ts` (name is historical — uses OpenAI gpt-4o-mini, not Anthropic)
- Functions: `generateSuggestions`, `detectIntent`, `analyzeSentiment`, `generateSmartReplies`, `summarizeConversation`, `buildAiContext`
- RAG helpers: `apps/api/src/lib/ai-rag.ts`
- Sliding window context: 6 messages when a past summary exists (AI_CONTEXT_SHORT), 30 messages otherwise (AI_CONTEXT_LONG)
- Conversation summaries stored on `Contact.pastAiSummary` and refreshed by `conversation-summary.worker.ts`
- **Future (M5):** will migrate to Anthropic Claude API for richer agent capabilities

### 1.7 Coding conventions
- Commit format: `feat(scope): description` / `fix(scope):` / `chore(scope):` (Conventional Commits)
- Branch naming: `feat/TRUST-123-short-description` / `fix/TRUST-456-...` / `chore/...`
- Branch from `develop`, not `main`; PRs require 1 approval + all CI checks
- TypeScript strict mode (`strict: true`) everywhere
- No `console.log` in production — use Fastify logger or pino
- Prefer named exports in shared packages
- API is ESM-only (`"type": "module"` in package.json); use `.js` extensions in imports
- No default exports in `packages/shared/`

### 1.8 Module / sprint status
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

### 1.9 Environment notes
- `.env` — main environment file (git-ignored, copy from `.env.example`)
- `.env.local` — local overrides
- Docker required locally: `docker compose up -d` starts Postgres 16, Redis 7, Meilisearch
- Key env vars: `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, `META_WHATSAPP_TOKEN`, `STRIPE_SECRET_KEY`

---

## 2. `.claude/settings.json`

### 2.1 Pre-approved permissions
All of the following run without a permission prompt:

```
pnpm *
turbo *
docker compose *
prisma *
npx *
node *
git log *
git diff *
git status *
git branch *
git show *
```

Destructive operations (`rm -rf`, `git push --force`, `git reset --hard`, `git checkout --`) are NOT pre-approved and will still prompt.

### 2.2 Hooks

**Hook 1 — Type-check after file edit**
- Trigger: `PostToolUse` on `Edit` or `Write` tool
- Condition: file path matches `*.ts` or `*.tsx`
- Action: determine affected package from file path, run `pnpm --filter <pkg> type-check`
- Scoping logic:
  - `apps/api/**` → `@WBMSG/api`
  - `apps/web/**` → `@WBMSG/web`
  - `apps/mobile/**` → `@WBMSG/mobile`
  - `packages/shared/**` → `@WBMSG/shared`
  - fallback → `pnpm type-check` (full monorepo)

**Hook 2 — Git status after commit**
- Trigger: `PostToolUse` on `Bash` tool
- Condition: command contains `git commit`
- Action: run `git status --short` and display output

**Hook 3 — Branch + dirty state on stop**
- Trigger: `Stop` event
- Action: echo `git branch --show-current` + `git status --short` — one-liner showing current branch and whether there are uncommitted changes

---

## 3. Custom slash commands

Location: `.claude/commands/` (7 files, each a `.md` with a description + shell commands)

| File | Command | Purpose |
|---|---|---|
| `check.md` | `/check` | `pnpm lint && pnpm type-check` — full monorepo pre-commit sanity check |
| `migrate.md` | `/migrate` | Prompt for migration name → `npx prisma migrate dev --name <name>` → `npx prisma generate` |
| `test-api.md` | `/test-api` | `pnpm --filter @WBMSG/api test` — API Vitest suite |
| `test-web.md` | `/test-web` | `pnpm --filter @WBMSG/web test` — web Vitest suite |
| `dev.md` | `/dev` | `docker compose up -d` then `pnpm dev` — full local stack |
| `build.md` | `/build` | `turbo build` — build all apps, surfaces errors |
| `db-studio.md` | `/db-studio` | `npx prisma studio` — browse DB at localhost:5555 |

---

## 4. Files to create

```
CLAUDE.md                           (repo root)
.claude/settings.json               (repo root)
.claude/commands/check.md
.claude/commands/migrate.md
.claude/commands/test-api.md
.claude/commands/test-web.md
.claude/commands/dev.md
.claude/commands/build.md
.claude/commands/db-studio.md
```

Total: 9 files. No existing files are modified (`.claude/settings.local.json` is unchanged).
