# Claude Code Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create CLAUDE.md, `.claude/settings.json` (permissions + 3 hooks), and 7 custom slash commands so every Claude Code session in the WBMSG monorepo starts informed and requires no permission prompts for standard commands.

**Architecture:** Three independent deliverables — a project-context markdown file (CLAUDE.md), a JSON config file (.claude/settings.json), and seven markdown prompt files (.claude/commands/). All are static files with no runtime dependencies or build steps.

**Tech Stack:** Markdown, JSON, Bash (Git Bash on Windows for hook commands)

## Global Constraints

- Working directory: `e:\Product\WhatsApp_CRM` (repo root)
- Product name: **WBMSG** — never "TRUST CRM"
- Audience: global SMBs — not India-specific
- `.claude/settings.local.json` must NOT be touched — it is user-local
- Hook commands use `bash` (Git Bash must be on PATH — it is, since the Bash tool works)
- No new dependencies are installed

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `CLAUDE.md` | Create | Project guide auto-loaded by Claude Code at every session start |
| `.claude/settings.json` | Create | Pre-approved permissions + 3 hooks |
| `.claude/commands/check.md` | Create | `/check` slash command |
| `.claude/commands/migrate.md` | Create | `/migrate` slash command |
| `.claude/commands/test-api.md` | Create | `/test-api` slash command |
| `.claude/commands/test-web.md` | Create | `/test-web` slash command |
| `.claude/commands/dev.md` | Create | `/dev` slash command |
| `.claude/commands/build.md` | Create | `/build` slash command |
| `.claude/commands/db-studio.md` | Create | `/db-studio` slash command |

---

### Task 1: CLAUDE.md

**Files:**
- Create: `CLAUDE.md` (repo root)

**Interfaces:**
- Produces: file Claude Code auto-loads at session start, giving it full project context without any user explanation

- [ ] **Step 1: Create `CLAUDE.md`**

Create `CLAUDE.md` at the repo root with this exact content:

```markdown
# WBMSG — Claude Code Guide

## Project

WhatsApp-first CRM for SMBs globally. GA target: March 2027. Sprint 1 complete.
9 product modules (M1–M9). M1 (Auth) live; M2 (Contacts), M3 (Inbox), M4 (Campaigns) in progress.

## Quick Commands

\`\`\`bash
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
\`\`\`

Local infra (Postgres 16, Redis 7, Meilisearch): `docker compose up -d`

## Repository Map

\`\`\`
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
\`\`\`

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
```

- [ ] **Step 2: Verify the file**

Run:
```bash
node -e "const fs=require('fs'); const c=fs.readFileSync('CLAUDE.md','utf8'); const opens=(c.match(/```/g)||[]).length; console.log(opens % 2 === 0 ? 'OK: all code fences balanced' : 'ERROR: unbalanced code fences'); console.log('Lines:', c.split('\n').length);"
```

Expected output:
```
OK: all code fences balanced
Lines: <number between 80 and 120>
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(claude): add CLAUDE.md project guide for Claude Code"
```

---

### Task 2: `.claude/settings.json` — permissions + hooks

**Files:**
- Create: `.claude/settings.json`

**Interfaces:**
- Produces: JSON config Claude Code reads to pre-approve commands and register 3 hooks

- [ ] **Step 1: Create `.claude/settings.json`**

Create `.claude/settings.json` with this exact content:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(turbo *)",
      "Bash(docker compose *)",
      "Bash(prisma *)",
      "Bash(npx *)",
      "Bash(node *)",
      "Bash(git log*)",
      "Bash(git diff*)",
      "Bash(git status*)",
      "Bash(git branch*)",
      "Bash(git show*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'pnpm type-check 2>&1 | tail -20'"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'cat | grep -q \"git commit\" && git status --short || true'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'echo \"[WBMSG] $(git branch --show-current) | $(git status --porcelain | wc -l | tr -d \" \") uncommitted file(s)\"'"
          }
        ]
      }
    ]
  }
}
```

**Hook explanations:**
- **Hook 1** (PostToolUse / Edit|Write): runs `pnpm type-check` after every file edit. Turborepo only rechecks packages whose inputs changed, so it stays fast.
- **Hook 2** (PostToolUse / Bash): reads stdin (the tool's JSON payload) and if it contains `"git commit"`, runs `git status --short` to show working tree state.
- **Hook 3** (Stop): fires when Claude finishes its turn — shows current branch and count of uncommitted files as a one-liner.

- [ ] **Step 2: Validate JSON is well-formed**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('Valid JSON')"
```

Expected output:
```
Valid JSON
```

- [ ] **Step 3: Verify permissions array has all 11 entries**

Run:
```bash
node -e "const s=JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('Allow entries:', s.permissions.allow.length)"
```

Expected output:
```
Allow entries: 11
```

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(claude): add settings.json with pre-approved permissions and hooks"
```

---

### Task 3: Custom slash commands

**Files:**
- Create: `.claude/commands/check.md`
- Create: `.claude/commands/migrate.md`
- Create: `.claude/commands/test-api.md`
- Create: `.claude/commands/test-web.md`
- Create: `.claude/commands/dev.md`
- Create: `.claude/commands/build.md`
- Create: `.claude/commands/db-studio.md`

**Interfaces:**
- Produces: 7 slash commands invokable as `/check`, `/migrate`, `/test-api`, `/test-web`, `/dev`, `/build`, `/db-studio`
- Note: Claude Code makes these available as `/project:<name>` (e.g. `/project:check`) — some versions also support the short form `/check`

- [ ] **Step 1: Create `.claude/commands/check.md`**

```markdown
Run a full pre-commit sanity check across the WBMSG monorepo.

Execute these commands in order and wait for each to complete:

1. `pnpm lint` — ESLint all packages
2. `pnpm type-check` — TypeScript strict check all packages

After both finish, report:
- How many ESLint errors and warnings (per package)
- How many TypeScript errors (per package)
- Final verdict: PASS (zero errors) or FAIL (list what broke)
```

- [ ] **Step 2: Create `.claude/commands/migrate.md`**

```markdown
Run a Prisma database migration for the WBMSG API.

$ARGUMENTS

If a migration name was passed as $ARGUMENTS, use it directly.
If no name was passed, ask: "What should this migration be named? (snake_case, e.g. add_contact_tags)"

Then execute in order:
1. `npx prisma migrate dev --name <migration_name>` — creates and applies the migration
2. `npx prisma generate` — regenerates the Prisma client

Report:
- The migration file path created (e.g. `apps/api/prisma/migrations/20260617123456_<name>/migration.sql`)
- Whether the client was regenerated successfully
- Any errors encountered
```

- [ ] **Step 3: Create `.claude/commands/test-api.md`**

```markdown
Run the WBMSG API test suite using Vitest.

Execute: `pnpm --filter @WBMSG/api test`

Show the complete test output. After it finishes, report:
- Total tests: passed / failed / skipped
- If any tests failed: show the test name, file, and failure reason
- If all passed: confirm with the pass count
```

- [ ] **Step 4: Create `.claude/commands/test-web.md`**

```markdown
Run the WBMSG web app test suite using Vitest.

Execute: `pnpm --filter @WBMSG/web test`

Show the complete test output. After it finishes, report:
- Total tests: passed / failed / skipped
- If any tests failed: show the test name, file, and failure reason
- If all passed: confirm with the pass count
```

- [ ] **Step 5: Create `.claude/commands/dev.md`**

```markdown
Start the full WBMSG local development stack.

Execute in order:
1. `docker compose up -d` — start Postgres 16, Redis 7, Meilisearch (safe to run if already up)
2. `pnpm dev` — start all apps via Turborepo in parallel (this is a long-running process)

Once running, the apps are available at:
- Web:             http://localhost:3000
- API:             http://localhost:4000
- API health:      http://localhost:4000/health
- Meilisearch:     http://localhost:7700
```

- [ ] **Step 6: Create `.claude/commands/build.md`**

```markdown
Build all apps and packages in the WBMSG monorepo.

Execute: `turbo build`

Turborepo builds in dependency order: shared packages first, then apps.
Output artifacts:
- `apps/api/dist/` — compiled Fastify API (ESM)
- `apps/web/.next/` — Next.js build output

After the build completes, report:
- Which packages were built vs served from cache
- Any build errors (with file and line number)
- Final verdict: SUCCESS or FAIL
```

- [ ] **Step 7: Create `.claude/commands/db-studio.md`**

```markdown
Open Prisma Studio to browse and edit the WBMSG database visually.

Prerequisites check:
- Confirm `DATABASE_URL` is set in `.env` (run `node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL ? 'DB URL set' : 'ERROR: DATABASE_URL missing')"`)
- If Docker isn't running, remind the user to run `docker compose up -d` first

Then execute: `npx prisma studio`

Prisma Studio opens at http://localhost:5555 and connects using `DATABASE_URL` from `.env`.
```

- [ ] **Step 8: Verify all 7 files exist**

Run:
```bash
node -e "
const fs = require('fs');
const files = ['check','migrate','test-api','test-web','dev','build','db-studio'];
files.forEach(f => {
  const path = '.claude/commands/' + f + '.md';
  const exists = fs.existsSync(path);
  console.log((exists ? 'OK' : 'MISSING') + ': ' + path);
});
"
```

Expected output:
```
OK: .claude/commands/check.md
OK: .claude/commands/migrate.md
OK: .claude/commands/test-api.md
OK: .claude/commands/test-web.md
OK: .claude/commands/dev.md
OK: .claude/commands/build.md
OK: .claude/commands/db-studio.md
```

- [ ] **Step 9: Commit**

```bash
git add .claude/commands/
git commit -m "feat(claude): add 7 custom slash commands for monorepo workflows"
```

---

## Self-Review

**Spec coverage check:**
- ✅ CLAUDE.md with all 9 sections from spec §1 (identity, commands, repo map, architecture, DB, AI, conventions, modules, env)
- ✅ settings.json with all 11 permission entries from spec §2.1
- ✅ Hook 1: type-check after Edit/Write (spec §2.2)
- ✅ Hook 2: git status after Bash with git commit (spec §2.2)
- ✅ Hook 3: branch + dirty state on Stop (spec §2.2)
- ✅ All 7 commands from spec §3 (check, migrate, test-api, test-web, dev, build, db-studio)
- ✅ `.claude/settings.local.json` untouched

**No placeholders** — every step has exact file content or exact commands with expected output.

**Type consistency** — no cross-task type references (all files are self-contained).
