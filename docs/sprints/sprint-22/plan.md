# Sprint 22 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-5.md`
> Tasks 6–7 cover Sprint 22.

## Pre-conditions
- Sprints 1–21 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Redis running (`docker compose up -d`)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 6 | Redis cache helpers + contacts/analytics caching | `apps/api/src/lib/cache.ts`, `apps/api/src/routes/contacts.ts`, `apps/api/src/routes/analytics.ts` |
| 7 | Rate limiting plugin + per-org AI key | `apps/api/src/plugins/rate-limit.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/organizations.ts`, `apps/api/src/lib/claude.ts`, `apps/api/prisma/schema.prisma` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Two consecutive `GET /v1/contacts` → second is faster (Redis hit logged)
- [ ] Manual: `POST /v1/contacts` → `GET /v1/contacts` → fresh data (cache busted)
- [ ] Manual: Send 101 requests in 1 min → 429 response on request 101
- [ ] Manual: `PATCH /v1/organizations` with custom `aiApiKey` → `/suggestions` endpoint uses that key (verify via Anthropic API key in response headers or billing dashboard)

## Deployment / Environment Notes

Install new dependencies:
```bash
pnpm --filter @WBMSG/api add ioredis @fastify/rate-limit
```

Run migration for `aiApiKey` on Organization:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_org_ai_api_key
pnpm exec prisma generate
```

No new env vars required (`REDIS_URL` already configured from Sprint 1).
