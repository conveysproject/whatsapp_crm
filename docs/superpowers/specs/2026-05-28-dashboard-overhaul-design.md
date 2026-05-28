# Dashboard Overhaul — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** `apps/api/src/routes/analytics.ts`, `apps/api/src/lib/analytics-queries.ts`, `apps/web/app/(dashboard)/dashboard/page.tsx`, `apps/web/components/analytics/`

---

## Overview

Replace the current minimal dashboard (4 metric cards + bar chart + basic team table + plan usage) with a next-generation page that serves two audiences on the same URL:

- **Agents** — see their personal work queue and daily performance scorecard
- **Admins / Managers** — see everything agents see, plus a full org-level overview with campaign snapshot, rich team leaderboard, and activity feed

---

## Page Structure

Single vertical scroll, four zones:

```
┌─────────────────────────────────────────────────┐
│  HEADER  Good morning, [Name] · WhatsApp status  │
├─────────────────────────────────────────────────┤
│  QUICK ACTIONS                                   │
│  New Campaign | Import Contacts                  │
│  New Conversation | New Template                 │
├─────────────────────────────────────────────────┤
│  MY WORK  (all roles)                            │
│  3 stat chips: Open Convos | Unread | Contacts   │
│  Top 3 assigned open conversations (preview)     │
│  MY PERFORMANCE: Resolved Today | Avg Response   │
│                  Messages Sent Today             │
├─────────────────────────────────────────────────┤
│  ORG OVERVIEW  (admin / manager only)            │
│  6 org metric cards                              │
│  Message volume chart | Campaign snapshot        │
│  Team leaderboard (rich, sortable)               │
│  Plan usage | Activity feed                      │
└─────────────────────────────────────────────────┘
```

---

## Role Gating

Role is fetched server-side in `DashboardPage` from an existing endpoint that returns `OrganizationMember.role`.

```ts
const isAdmin = role === "admin" || role === "manager"
```

The Org Overview `<section>` is conditionally rendered: `{isAdmin && <OrgOverviewSection />}`. When `isAdmin` is false, no data is fetched for that section — agents never trigger those queries.

Roles `agent` and `viewer` see only the Header, Quick Actions, and My Work zones.

---

## Header

- **Greeting:** `"Good morning/afternoon/evening, [firstName]"` — first name from Clerk `auth()`, time-of-day computed server-side at render time.
- **WhatsApp status pill:** `DashboardPage` calls `GET /v1/onboarding/status` directly (same call `DashboardLayout` makes — it's cached 120s on the API so the double-fetch is free). Renders `● Connected` (green) or `● Disconnected` (amber) linking to `/settings/whatsapp-account`.

---

## Quick Actions

Static client component. Four `<Link>` buttons with icons:

| Label | Destination |
|---|---|
| New Campaign | `/campaigns/new` |
| Import Contacts | `/contacts/import` |
| New Conversation | `/inbox` (opens new conversation flow) |
| New Template | `/templates/new` |

No data fetch. Renders identically for all roles.

---

## My Work Section

**Client component** (`MyWorkSection.tsx`). Fetches `GET /v1/analytics/my-work` on mount.

### Stat Chips (3)
- My Open Conversations
- My Unread Messages
- My Assigned Contacts

Each chip links to the relevant filtered view (inbox filtered to assigned + open, etc.).

### Conversation Previews
Top 3 assigned open conversations, each row showing:
- Contact name
- Last message preview (truncated to ~60 chars)
- Time since last message
- Unread badge

Each row links to `/inbox?conversation=<id>`.

### My Performance Cards (3)
- **Resolved Today** — conversations closed by this user since midnight
- **Avg First Response** — median seconds from conversation `createdAt` to first outbound message by this user (last 30 days), displayed as `"Xm Ys"`
- **Messages Sent Today** — outbound messages sent by this user since midnight

---

## Org Overview Section (admin / manager only)

### Org Metric Cards (6)

Rendered server-side, data passed as props from `DashboardPage`. Grid: `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`.

| Metric | Source |
|---|---|
| Open Conversations | existing `openConversations` |
| Total Contacts | existing `totalContacts` |
| Messages Today | existing `messagesToday` |
| Campaigns This Month | new `campaignsSentThisMonth` |
| Avg First Response | new `avgFirstResponseTime` (org-wide, last 30d) |
| Bot Conversations | new `botConversations` (today) |

### Message Volume Chart
Existing `ConversationChart.tsx` — kept as-is.

### Campaign Snapshot
Client component (`CampaignSnapshot.tsx`). Fetches `GET /v1/analytics/campaign-snapshot`.

- **Last campaign:** name, sent date, horizontal delivery bar (sent → delivered → read), failed count badge
- **Next scheduled:** name, scheduled datetime, recipient count pill. Hidden if none.

### Team Leaderboard
Replaces `TeamTable.tsx`. Client component (`TeamLeaderboard.tsx`). Fetches `GET /v1/analytics/team`.

Columns: Agent | Open Convos | Resolved Today | Avg Response | SLA Breaches | Messages Sent Today

Default sort: Resolved Today descending. Column headers are clickable to re-sort (client-side, no re-fetch).

### Plan Usage Widget
Existing `PlanUsageWidget` — kept as-is.

### Activity Feed
Client component (`ActivityFeed.tsx`). Fetches `GET /v1/analytics/activity-feed`.

10 most recent org events, each with icon + label + relative timestamp:

| Type | Label example |
|---|---|
| `contact_created` | "New contact: Rahul Sharma" |
| `campaign_sent` | "Campaign 'May Offer' sent to 240 contacts" |
| `conversation_closed` | "Conversation with Priya closed by Anil" |
| `member_joined` | "Sandeep joined the team" |

Hidden entirely if no events exist.

---

## API Changes

### Extended: `GET /v1/analytics/overview`

Add to `OverviewMetrics` and `getOverviewMetrics()`:

```ts
campaignsSentThisMonth: number   // campaigns with status "executed", createdAt in current month
avgFirstResponseTime: number     // median seconds, org-wide, last 30 days (0 if no data)
botConversations: number         // conversations with at least one bot message today
```

### Extended: `GET /v1/analytics/team`

Replace `AgentPerformance[]` with `AgentStats[]`:

```ts
interface AgentStats {
  userId: string
  displayName: string
  openConversations: number
  resolvedToday: number
  avgFirstResponseSecs: number
  slaBreaches: number
  messagesSentToday: number
}
```

`displayName` is resolved from `OrganizationMember` joined to Clerk user display name, falling back to `userId` if unavailable. SLA breach = conversation open longer than `SlaPolicy.firstResponseSecs` with no outbound reply.

### New: `GET /v1/analytics/my-work`

Auth-scoped to calling user (`request.auth.userId`).

```ts
interface MyWorkData {
  assignedOpen: number
  unreadCount: number
  assignedContacts: number
  resolvedToday: number
  avgFirstResponseSecs: number
  messagesSentToday: number
  topConversations: Array<{
    id: string
    contactName: string
    lastMessagePreview: string
    lastMessageAt: string   // ISO
    unreadCount: number
  }>
}
```

### New: `GET /v1/analytics/campaign-snapshot`

```ts
interface CampaignSnapshotData {
  lastCampaign: {
    id: string
    name: string
    sentAt: string
    totalSent: number
    delivered: number
    read: number
    failed: number
  } | null
  nextScheduled: {
    id: string
    name: string
    scheduledAt: string
    recipientCount: number
  } | null
}
```

### New: `GET /v1/analytics/activity-feed`

```ts
interface ActivityEvent {
  type: "contact_created" | "campaign_sent" | "conversation_closed" | "member_joined"
  label: string
  timestamp: string   // ISO
}
// returns last 10 events
```

All new/extended endpoints follow the existing `cacheGet` / `cacheSet` / `orgKey` pattern with 120s TTL.

---

## Frontend File Plan

### New files

| File | Type | Purpose |
|---|---|---|
| `components/analytics/QuickActions.tsx` | client | 4 action buttons |
| `components/analytics/MyWorkSection.tsx` | client | My Work zone (stat chips + previews + performance) |
| `components/analytics/CampaignSnapshot.tsx` | client | Last/next campaign card |
| `components/analytics/ActivityFeed.tsx` | client | Recent org events list |
| `components/analytics/TeamLeaderboard.tsx` | client | Sortable agent stats table |
| `components/analytics/OrgMetricCards.tsx` | server-props | 6-card org metric grid |

### Modified files

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/page.tsx` | Fetch role + wabaConnected, pass to header, gate Org Overview |
| `apps/api/src/lib/analytics-queries.ts` | Add new query functions |
| `apps/api/src/routes/analytics.ts` | Add new route handlers |

### Kept as-is

- `components/analytics/ConversationChart.tsx`
- `components/analytics/MetricCard.tsx`

---

## Error Handling & Loading States

**Loading:** Each client component renders a gray skeleton placeholder at the same height as its loaded content. Sections load independently.

**Empty states:**
- My Work with 0 assigned conversations → "No open conversations assigned to you" + link to Inbox
- Team Leaderboard with no data → "No activity yet today"
- Campaign Snapshot with no campaigns → "No campaigns sent yet" + "Create Campaign" link
- Activity Feed with no events → hidden entirely

**Errors:** Each client component catches fetch failures and renders a subtle inline `"Could not load data"` message. No toast, no crash. Page remains usable if one widget fails.

**Polling:** None. Client components fetch once on mount. Analytics are cached 120s server-side. Users reload to refresh.
