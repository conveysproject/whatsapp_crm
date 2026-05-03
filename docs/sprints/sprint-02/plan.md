# Sprint 2 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-1.md`
> Tasks 7–13 cover Sprint 2.

## Pre-conditions
- Sprint 1 complete and merged
- Clerk account created; `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` available
- Local Postgres running: `docker compose up -d`

## Task Summary

| # | Task | Key files |
|---|---|---|
| 7 | Install dependencies (Prisma, Clerk) | `apps/api/package.json`, `apps/web/package.json` |
| 8 | Prisma schema + migration | `apps/api/prisma/schema.prisma`, `src/lib/prisma.ts` |
| 9 | Auth plugin (Clerk JWT + Fastify preHandler) | `src/lib/clerk.ts`, `src/plugins/auth.ts`, `src/plugins/prisma.ts`, `src/types/fastify.d.ts` |
| 10 | API routes (orgs, users, invitations) | `src/routes/organizations.ts`, `users.ts`, `invitations.ts`, `index.ts` |
| 11 | Shared types expansion | `packages/shared/src/index.ts` |
| 12 | Web auth pages + Clerk middleware | `apps/web/middleware.ts`, `app/(auth)/` |
| 13 | Settings pages + API client | `apps/web/lib/api.ts`, `app/(dashboard)/settings/` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass (clerk.test, auth.test, organizations.test, health.test, sentry.test)
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Sign up → create org → invite user → accept invite → sign in as invited user → `GET /v1/users` returns both members

## Deployment / Environment Notes

Add to `.env` (copy from `.env.example`):
```
DATABASE_URL=postgresql://WBMSG:WBMSG@localhost:5432/WBMSG?schema=public
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/inbox
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Run migration after schema is written:
```bash
cd apps/api
pnpm exec prisma migrate dev --name init_auth
pnpm exec prisma generate
```
