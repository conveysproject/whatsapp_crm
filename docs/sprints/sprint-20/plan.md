# Sprint 20 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-5.md`
> Task 4 covers Sprint 20.

## Pre-conditions
- Sprints 1–19 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Meta App configured with `whatsapp_business_management` OAuth scope

## Task Summary

| # | Task | Key files |
|---|---|---|
| 4 | WABA onboarding wizard (API + UI) | `apps/api/src/routes/onboarding.ts`, `apps/api/src/routes/onboarding.test.ts`, `apps/api/prisma/schema.prisma`, `apps/web/app/(onboarding)/layout.tsx`, `apps/web/app/(onboarding)/connect-waba/page.tsx`, `apps/web/app/(onboarding)/connect-waba/callback/page.tsx`, `apps/web/app/(onboarding)/provision-number/page.tsx`, `apps/web/app/(onboarding)/invite-team/page.tsx`, `apps/web/app/(onboarding)/checklist/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `onboarding.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: New org → redirected to `/onboarding/connect-waba`
- [ ] Manual: Complete Meta OAuth flow → callback page shows success → org `wabaAccessToken` set in DB
- [ ] Manual: Enter Phone Number ID → saved to org → webhook URL shown
- [ ] Manual: Invite teammate email → Clerk invitation email arrives
- [ ] Manual: `GET /v1/onboarding/status` → `{ wabaConnected: true, numberProvisioned: true }`
- [ ] Manual: Checklist page → "Go to Inbox" navigates to `/inbox`

## Deployment / Environment Notes

Add to `.env` and staging/production secrets:
```
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=https://<your-domain>/onboarding/connect-waba/callback
NEXT_PUBLIC_META_APP_ID=...
```

Run migration after schema change:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_org_waba_onboarding
pnpm exec prisma generate
```
