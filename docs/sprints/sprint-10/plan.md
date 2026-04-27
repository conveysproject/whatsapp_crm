# Sprint 10 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-3.md`
> Tasks 7–8 cover Sprint 10.

## Pre-conditions
- Sprint 8 complete (`segments` table, `evaluateSegment()` working)
- Sprint 9 complete (at least one template with `status: approved`)
- Redis running: `docker compose up -d`

## Task Summary

| # | Task | Key files |
|---|---|---|
| 7 | Campaign API + BullMQ delayed worker | `apps/api/src/routes/campaigns.ts`, `apps/api/src/workers/campaign.worker.ts`, `apps/api/src/lib/queue.ts`, `apps/api/src/routes/campaigns.test.ts`, `packages/shared/src/index.ts` |
| 8 | Campaigns list + new campaign form | `apps/web/app/(dashboard)/campaigns/page.tsx`, `apps/web/app/(dashboard)/campaigns/new/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `campaigns.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create campaign → schedule immediately → check BullMQ dashboard (or Redis) for job enqueued
- [ ] Manual: Watch campaign `status` change: draft → scheduled → running → completed
- [ ] Manual: Check that contacts in segment received the WhatsApp message

## Deployment / Environment Notes

No new env vars required (uses existing `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `REDIS_URL`).

Monitor BullMQ jobs during testing:
```bash
# Install bull-board locally for queue inspection
pnpm --filter @trustcrm/api add bull-board
# Or use Redis CLI to inspect queue
redis-cli lrange "bull:campaigns:wait" 0 -1
```

Template must be in `approved` status before scheduling. If testing locally without real Meta approval, manually set:
```bash
psql $DATABASE_URL -c "UPDATE templates SET status = 'approved' WHERE id = '<template_id>';"
```
