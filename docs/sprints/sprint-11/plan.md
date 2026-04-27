# Sprint 11 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-3.md`
> Tasks 9–10 cover Sprint 11.

## Pre-conditions
- Sprint 4 complete (`deals` + `pipelines` tables in Prisma schema)
- Sprint 5 complete (web UI components: Button, Badge, etc.)
- Local environment running: `docker compose up -d`

## Task Summary

| # | Task | Key files |
|---|---|---|
| 9 | Pipelines + Deals CRUD API + stage transition | `apps/api/src/routes/pipelines.ts`, `apps/api/src/routes/deals.ts`, `apps/api/src/routes/deals.test.ts` |
| 10 | Kanban board UI with drag-and-drop | `apps/web/components/deals/DealCard.tsx`, `apps/web/components/deals/KanbanBoard.tsx`, `apps/web/app/(dashboard)/deals/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `deals.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create a pipeline with stages `["new", "qualified", "won"]` via API
- [ ] Manual: Create 3 deals in different stages → `/deals` shows Kanban board
- [ ] Manual: Drag deal from "new" to "qualified" → `PATCH /v1/deals/:id/stage` fires → refresh page, card stays in new column
- [ ] Manual: Deal value shows in INR format (₹1,00,000)

## Deployment / Environment Notes

No new env vars required. No new migrations (deals + pipelines tables created in Sprint 4 migration).

Seed a pipeline and deals for testing:
```bash
# Create pipeline
curl -X POST http://localhost:4000/v1/pipelines \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sales Pipeline","stages":["new","qualified","proposal","won","lost"]}'

# Create a deal
curl -X POST http://localhost:4000/v1/deals \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Acme Corp - 50 seats","pipelineId":"<pipeline_id>","value":150000,"stage":"new"}'
```
