# WBMSG — Claude Code Instructions

> Project context, tech stack, DB schema, sprint plan: `docs/PROJECT_REFERENCE.md`

**Apps:** `api` (Fastify 4 + ESM + Node 20) · `web` (Next.js 15 + Tailwind) · `mobile` (Expo 51)
**Packages:** `shared` (branded types) · `tsconfig` · `eslint-config` (ESLint 8, NOT v9)

**Commands:** `pnpm install|dev|build|type-check|lint|test|clean` · `pnpm --filter @WBMSG/api test`

## Gotchas

**ESM (apps/api)** — `"type":"module"`; imports need `.js` extension; `@WBMSG/shared` is ESM-only; tsconfig must use `"module":"Node16","moduleResolution":"node16"` — never `bundler` for Node servers

**TypeScript** — `strict:true` everywhere; API uses Node16 moduleResolution, others use bundler; never commit `*.tsbuildinfo`; add explicit `JSX.Element` return types in Next.js to avoid pnpm TS2742

**ESLint** — v8 only; never upgrade to v9 (breaks `@typescript-eslint/eslint-plugin` v7)

**pnpm** — never npm/yarn; pinned `pnpm@10.33.2`; Windows EPERM → `npm install -g pnpm`

**Testing** — Vitest; always `Fastify({logger:false})` in tests; use `app.inject()` not real HTTP

**Branded IDs** — `type ContactId = string & {readonly __brand:"ContactId"}` — never plain `string`

**Turbo** — `lint`/`type-check` depend on `^lint`/`^type-check` (not `^build`); `test` depends on `^build`

**Git** — Conventional Commits: `feat(api): add endpoint` · branch: `feat/TRUST-123-description`

**Docker** — `docker compose up -d` starts Postgres 16 (5432), Redis 7 (6379), Meilisearch (7700)
