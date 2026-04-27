# Sprint 8 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-3.md`
> Tasks 3–4 cover Sprint 8.

## Pre-conditions
- Sprint 7 complete and merged (contact detail page, tags working)
- Local Postgres running with contacts table populated (use CSV import from Sprint 7 or seed manually)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 3 | Segment Prisma model + CRUD API + evaluator | `apps/api/prisma/schema.prisma`, `apps/api/src/lib/segment-evaluator.ts`, `apps/api/src/routes/segments.ts`, `packages/shared/src/index.ts` |
| 4 | Segment builder UI + segments list page | `apps/web/components/segments/SegmentBuilder.tsx`, `apps/web/app/(dashboard)/contacts/segments/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `segments.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create segment "Hot Leads" with filter `lifecycleStage = lead` → evaluate → returns contacts in lead stage
- [ ] Manual: Create segment "VIP Customers" with filter `tags contains vip` → evaluate → returns tagged contacts

## Deployment / Environment Notes

Run migration after schema change:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_segments
pnpm exec prisma generate
```

No new env vars required.

Seed test contacts for manual testing:
```bash
# POST a few contacts with different stages and tags via curl or Postman
curl -X POST http://localhost:4000/v1/contacts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+919000000001","name":"Alice","lifecycleStage":"lead","tags":["vip"]}'
```
