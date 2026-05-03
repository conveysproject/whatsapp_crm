# Sprint 17 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-4.md`
> Tasks 8–9 cover Sprint 17.

## Pre-conditions
- Sprints 1–16 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Beta accounts generating real conversation data (for meaningful analytics)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 8 | Analytics query layer + API routes + tests | `apps/api/src/lib/analytics-queries.ts`, `apps/api/src/routes/analytics.ts`, `apps/api/src/routes/analytics.test.ts` |
| 9 | Analytics dashboard UI | `apps/web/components/analytics/MetricCard.tsx`, `apps/web/components/analytics/ConversationChart.tsx`, `apps/web/components/analytics/TeamTable.tsx`, `apps/web/app/(dashboard)/analytics/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass including `analytics.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: `GET /v1/analytics/overview` → JSON with `openConversations`, `resolvedToday`, `avgFirstResponseSecs`, `breachedSla`
- [ ] Manual: `GET /v1/analytics/conversations?days=14` → 14-element array with `date`, `inbound`, `outbound`
- [ ] Manual: `GET /v1/analytics/team` → per-agent rows with `assignedCount`, `resolvedCount`, `avgResponseSecs`
- [ ] Manual: `/analytics` page loads; MetricCards show KPIs; BarChart renders 14-day bar chart; TeamTable shows agents
- [ ] Manual: Agent role → `/analytics` returns 403; sidebar link not visible

## Deployment / Environment Notes

Run migration to add index:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_analytics_indexes
pnpm exec prisma generate
```

Install new dependency in web app:
```bash
pnpm --filter @WBMSG/web add recharts
```

No new env vars required.
