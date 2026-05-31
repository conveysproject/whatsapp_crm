# Analytics Page — Design Spec
**Date:** 2026-05-31  
**Status:** Approved

---

## Overview

Build a dedicated Analytics section at `/analytics` — a single page with horizontal tabs and shared date range controls. This is the last major feature gap versus competitors. The implementation reuses all existing analytics infrastructure (6 API endpoints, Redis caching, existing components) and adds 3 new API endpoints plus new tab components.

---

## URL Structure

```
/analytics?tab=overview&days=30
```

- `tab`: `overview` | `conversations` | `team` | `campaigns` | `predictive` (default: `overview`)
- `days`: `7` | `14` | `30` | `90` (default: `30`)
- State managed via `useSearchParams()` + `router.replace()` — no extra state library
- Sidebar `Analytics` entry changes href to `/analytics`, prefix-match active state
- `analytics/predictive/page.tsx` stays as a standalone route; its logic is extracted into `components/analytics/PredictiveTab.tsx` which both the page and the tab shell import

---

## Tab Layout

```
[Overview] [Conversations] [Team] [Campaigns] [Predictive]        [Export CSV]
[7d] [14d] [30d] [90d]
─────────────────────────────────────────────────────────────────
<active tab content>
```

- `DateRangeSelector` (preset pills) sits below tab bar, above content
- `ExportButton` top-right; disabled on Predictive tab
- Each tab fetches independently, renders its own skeleton while loading

---

## Architecture

**Approach A — tab shell + reuse existing components**

Single client component `apps/web/app/(dashboard)/analytics/page.tsx` reads URL params and renders the active tab. No sub-routes added. Existing `analytics/predictive/page.tsx` content is rendered inline when `tab=predictive`.

---

## API Changes

### New endpoints (added to existing `analyticsRouter`)

#### `GET /v1/analytics/agent/:id?days=N`
Per-agent drill-down.  
Response:
```ts
{
  resolvedCount: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: {
    id: string;
    contactName: string;
    lastMessagePreview: string;
    status: string;
    lastMessageAt: string;
  }[];
}
```
Cache key: `analytics:agent:{id}:{days}`, TTL 60s.

#### `GET /v1/analytics/campaigns?days=N`
Campaign performance list for the period, sorted by `sentAt` desc.  
Response:
```ts
{
  id: string;
  name: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;  // 0–100
  readRate: number;      // 0–100
}[]
```
Cache: TTL 120s.

#### `GET /v1/analytics/export?tab=overview|conversations|team|campaigns&days=N`
Returns `Content-Type: text/csv`. Always fresh (no cache). Streams inline — browser triggers download via `Content-Disposition: attachment`.

### Updated existing endpoints

- `GET /analytics/overview` — extend `getOverviewMetrics` to accept `days` param (currently hardcoded to 30d internally)
- `GET /analytics/team` — extend `getTeamStats` to accept `days` param (currently hardcoded to 30d internally)
- `GET /analytics/conversations` — already accepts `?days=N`, no change needed

---

## Frontend Components

### New files

| File | Purpose |
|------|---------|
| `app/(dashboard)/analytics/page.tsx` | Tab shell — reads/writes URL params, renders active tab |
| `components/analytics/DateRangeSelector.tsx` | 7d / 14d / 30d / 90d pill buttons |
| `components/analytics/OverviewTab.tsx` | OrgMetricCards + ConversationChart, `days`-aware |
| `components/analytics/ConversationsTab.tsx` | Line chart (inbound/outbound trend) + donut (status breakdown: open/resolved/bot) |
| `components/analytics/TeamTab.tsx` | TeamLeaderboard + slide-in side panel for agent drill-down |
| `components/analytics/CampaignsTab.tsx` | Table with delivery rate progress bars, sorted by date desc |
| `components/analytics/ExportButton.tsx` | Fetches export endpoint, triggers browser download |

### Updated files

| File | Change |
|------|--------|
| `components/analytics/ConversationChart.tsx` | Accept `days` prop (remove hardcoded 14) |
| `components/analytics/TeamLeaderboard.tsx` | Accept `days` prop + `onAgentClick?: (userId: string) => void` callback |
| `components/analytics/Sidebar.tsx` | Change Analytics href to `/analytics`, remove `exact: true` |

### Agent drill-down panel
- Slides in from the right (CSS transform, not a modal)
- Closes on Escape key or backdrop click
- Shows: resolved count, avg response time, SLA breaches, top 10 conversations list
- Error state with retry button if fetch fails

---

## Loading & Error States

- **Loading:** Each tab renders `animate-pulse` skeleton cards (existing pattern from TeamLeaderboard, CampaignSnapshot)
- **Tab switch:** Instant mount — new tab fetches independently, no full-page spinner
- **Fetch errors:** Inline `bg-red-50 text-red-600 rounded px-3 py-2` banner per tab — other tabs unaffected
- **Export errors:** Inline alert in the same style (no toast library)

---

## Testing

### API (Vitest + `app.inject()`)
- Extend `routes/analytics.test.ts` with tests for the 3 new endpoints
- Extend `lib/analytics-queries.test.ts` with tests for `getAgentStats`, `getCampaignAnalytics`
- All new tests mock `fastify.prisma` — no real HTTP calls (avoids the ECONNRESET issue in the pre-existing test)

### Frontend
No component tests — consistent with the rest of the web app.

---

## What This Beats vs Competitors

WhatsJet analytics: basic message counts, flat campaign stats, no team view, no drill-down, no export.

This ships: tabbed section, date range filtering, per-agent drill-down panel, conversation status breakdown donut, campaign delivery table with rates, CSV export across all tabs, predictive AI tab — all in one cohesive page.
