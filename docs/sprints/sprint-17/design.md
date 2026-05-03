# Sprint 17 — Analytics Dashboard

## Sprint Goal
Give team leads a single dashboard to understand support load, agent performance, and SLA health — replacing ad-hoc Postgres queries with a purpose-built reporting view.

## What We're Building

- **Analytics query layer** — `apps/api/src/lib/analytics-queries.ts`: three pure async functions that query Postgres directly (no ORM magic for aggregations):
  - `getOverviewMetrics(prisma, organizationId)` → `{ openConversations, resolvedToday, avgFirstResponseSecs, breachedSla }` — counts from `conversations` + `messages` tables.
  - `getConversationVolume(prisma, organizationId, days = 14)` → `DailyVolume[]` — one row per day for the last N days: `{ date: string; inbound: number; outbound: number }`. Uses `DATE_TRUNC('day', ...)` via `$queryRaw`.
  - `getTeamPerformance(prisma, organizationId)` → `AgentPerformance[]` — per-agent row: `{ agentId, assignedCount, resolvedCount, avgResponseSecs }`.
- **Analytics API** — `apps/api/src/routes/analytics.ts`: three GET endpoints:
  - `GET /v1/analytics/overview` — calls `getOverviewMetrics`
  - `GET /v1/analytics/conversations?days=14` — calls `getConversationVolume`
  - `GET /v1/analytics/team` — calls `getTeamPerformance`
  All three are admin/manager-only (RBAC check).
- **Analytics dashboard** — `apps/web/app/(dashboard)/analytics/page.tsx`: top row of `MetricCard` components (4 KPIs), below that a `ConversationChart` (recharts `BarChart` showing inbound vs outbound volume), below that a `TeamTable` (sortable table of agent performance). All data fetched via React Query; 5-minute stale time (no real-time push).
- **SLA breach count** — Uses the `SlaPolicy` stub from Sprint 12. `breachedSla` counts conversations where `firstRespondedAt - createdAt > slaPolicy.firstResponseSecs`. Full SLA enforcement (alerts, escalation) deferred to Sprint 24.

## Key Technical Decisions

- **`$queryRaw` for aggregations, not Prisma's `groupBy`** — Prisma's `groupBy` can't express `DATE_TRUNC` or complex multi-join aggregations. Raw SQL with parameterized queries is safer and more expressive. `organizationId` is always a parameter, never interpolated.
- **No dedicated analytics DB / read replica in Sprint 17** — Query volume is low (one dashboard per org, 5-minute cache). Direct Postgres queries with indexes on `(organizationId, createdAt)` are sufficient. Read replica is Sprint 22+.
- **recharts `BarChart` over Chart.js or D3** — recharts is a React-native chart library (uses SVG, no Canvas). It's simpler than D3 and more React-idiomatic than Chart.js. The grouped bar chart (inbound/outbound per day) needs only 15 lines of JSX.
- **5-minute React Query stale time** — Analytics data doesn't need to be real-time. Agents don't watch the dashboard live; team leads review it periodically. Reducing refetch frequency cuts DB load.
- **`analytics` page accessible to `admin` and `manager` roles only** — Agents can't see org-wide performance data. Sidebar link is conditionally rendered based on Clerk JWT role claim.

## Dependencies

- **External:** `recharts` npm package installed in web app
- **Internal:** Sprints 1–16 complete; `SlaPolicy` stub from Sprint 12; conversations + messages tables populated from beta accounts

## Definition of Done

- [ ] `GET /v1/analytics/overview` returns 4 KPI fields
- [ ] `GET /v1/analytics/conversations?days=14` returns 14-element `DailyVolume[]`
- [ ] `GET /v1/analytics/team` returns per-agent rows
- [ ] `/analytics` page renders MetricCards + BarChart + TeamTable
- [ ] Dashboard visible only to admin/manager role (agent sees 403 or no link)
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `analytics.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `$queryRaw` SQL injection via `organizationId` | Low | Critical | `organizationId` always passed as Prisma `$queryRaw` parameter, never string-interpolated |
| Analytics queries slow on large orgs (>100K conversations) | Medium | Medium | Index on `(organizationId, createdAt)` on `conversations` table; added in this sprint's migration |
| recharts SSR hydration mismatch | Low | Medium | `ConversationChart` is `"use client"` with `dynamic(() => ..., { ssr: false })` wrapper |
