# Trust Score — Full Platform Design

**Date:** 2026-06-01  
**Approach:** Option A — Full Trust Score Platform  
**Status:** Approved

---

## Overview

Upgrade Trust Score from a static org-level gauge to a complete CRM trust intelligence platform:

- Org-level score with daily history and trend chart
- Actionable recommendations with deep-links to fix each issue
- Per-contact ML score surfaced in the contacts list, contact detail panel, and inbox conversation header

Competitors show a single static score. This design makes the score dynamic, contextual, and actionable.

---

## Architecture

Five areas of change:

| Layer | What changes |
|---|---|
| Prisma schema | New `OrgTrustScoreSnapshot` model for daily org score storage |
| BullMQ worker | New `trust-score` queue + daily job writing snapshots for all orgs |
| API | `GET /v1/trust-score` gains `?history=true`; contact route unchanged |
| Web — Trust Score page | Trend chart added above gauge; recommendations gain action buttons |
| Web — Contact surfaces | Contacts list column, contact detail section, inbox badge |

The ML service (`services/ml/routers/trust_score.py`) is not changed.  
Per-contact scores are always computed live — no snapshot storage for contacts.

---

## Data Model

New Prisma model in `apps/api/prisma/schema.prisma`:

```prisma
model OrgTrustScoreSnapshot {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  score          Int
  breakdown      Json     // { deliveryScore, responseScore, contactScore, campaignScore }
  recordedAt     DateTime @default(now()) @map("recorded_at")

  @@index([organizationId, recordedAt])
  @@map("org_trust_score_snapshots")
}
```

**Decisions:**
- `breakdown` is JSON (same shape as the existing API response breakdown array)
- No relation to `Organization` — all queries filter by `organizationId` directly, consistent with the rest of the schema
- No per-contact snapshot — ML call is fast enough to compute live
- Duplicate guard: worker skips orgs that already have a snapshot for today (date-truncated `recordedAt`)
- Migration: `prisma db push --accept-data-loss` + `prisma migrate resolve --applied` (no interactive TTY)

---

## Backend

### BullMQ Worker — `apps/api/src/workers/trust-score.ts`

New repeatable job registered at server startup:

```
Queue: trust-score
Job name: trust-score:snapshot
Schedule: repeat { pattern: '0 2 * * *' }  (2 AM daily)
```

Worker logic per execution:
1. Query distinct `organizationId` values from `organizations` table (active orgs only)
2. For each org, run the same 6-query computation already in `GET /v1/trust-score`
3. Skip if a snapshot for today already exists (`recordedAt >= start-of-today`)
4. Write `OrgTrustScoreSnapshot` row with score + breakdown JSON

Worker is registered in `apps/api/src/index.ts` alongside the existing campaign, flow, and inbound-message workers.

### Updated `GET /v1/trust-score`

Gains optional query param `?history=true`. When set, adds a `history` field to the response:

```ts
// Response shape with ?history=true
{
  data: {
    score: 74,
    breakdown: [
      { category: "Delivery Rate",    score: 22, maxScore: 30, description: "..." },
      { category: "Response Rate",    score: 18, maxScore: 25, description: "..." },
      { category: "Contact Quality",  score: 20, maxScore: 25, description: "..." },
      { category: "Campaign Activity",score: 14, maxScore: 20, description: "..." },
    ],
    recommendations: [
      { text: "Tag contacts with lifecycle stage to improve targeting.", href: "/contacts" },
      { text: "Run your first campaign to start building engagement history.", href: "/campaigns/new" },
    ],
    history: [
      { score: 61, recordedAt: "2026-04-01T02:00:00Z" },
      { score: 68, recordedAt: "2026-04-02T02:00:00Z" },
      ...
    ]
  }
}
```

`recommendations` changes from `string[]` to `{ text: string; href: string }[]`.

Recommendation deep-links:

| Trigger | Text | href |
|---|---|---|
| Delivery rate < 80% | "Check phone number validity — low delivery rate may indicate stale contacts." | `/contacts` |
| Response rate < 10% | "Increase engagement by using personalised messages and follow-ups." | `/campaigns/new` |
| Contact quality < 30% | "Tag your contacts with lifecycle stage and interest to improve targeting." | `/contacts` |
| No campaigns | "Run your first campaign to start building engagement history." | `/campaigns/new` |
| Response rate < 10% + ≥50 messages | "Set up an auto-reply flow to respond instantly." | `/flows/new` |

`GET /v1/contacts/:id/trust-score` — no changes.

---

## Frontend — Org Trust Score Page

`apps/web/app/(dashboard)/trust-score/page.tsx` is refactored into a shell component pattern.

### Trend Chart (new — above the gauge)

- SVG line chart, no third-party library
- X-axis: date labels (last 30 days); Y-axis: 0–100
- Coloured polyline with dots; colour matches score tier (green/yellow/red for last point)
- Fewer than 2 snapshots: renders a placeholder card "Not enough history yet — check back tomorrow"
- Fetch uses `?history=true`; gauge and chart both read from the same response

### Actionable Recommendations

Recommendations card changes from a `<ul>` of plain text to a list of rows:

```
→  Tag your contacts with lifecycle stage     [Fix it →]
→  Run your first campaign                    [Fix it →]
```

Each row: recommendation text on the left, a small `Fix it →` link button on the right that navigates to `href`.

### TrustScoreData type update

```ts
interface Recommendation {
  text: string;
  href: string;
}

interface TrustScoreData {
  score: number;
  breakdown: { category: string; score: number; maxScore: number; description: string }[];
  recommendations: Recommendation[];
  history?: { score: number; recordedAt: string }[];
}
```

---

## Frontend — Contact Surfaces

### 5a — Contacts List Column

- New `Trust` column (last column before row actions) in the contacts table
- Renders a colour-coded badge: `High` (green), `Medium` (yellow), `Low` (red), `—` while loading
- Scores fetched lazily per visible row via `IntersectionObserver`
- One `GET /v1/contacts/:id/trust-score` call per row when it enters the viewport
- No bulk endpoint — ML calls are fast; lazy loading prevents N requests on mount

### 5b — Contact Detail Panel

New "Trust Score" card section on `/contacts/[id]`:

- Small gauge (same SVG component, scaled down)
- Label badge: `High / Medium / Low / Very Low`
- 3 key factor lines derived from the ML response features:
  - "Last message: N days ago"
  - "Response ratio: N%"
  - "Lifecycle: [stage]"
- Fetches `GET /v1/contacts/:id/trust-score` on mount
- Loading: skeleton; error/unavailable: card hidden silently

### 5c — Inbox Conversation Header

- Small pill badge added next to the contact name in the conversation header
- Format: `● High` / `● Medium` / `● Low` with matching colour dot
- Fetches trust score when conversation opens (contact ID is available from conversation data)
- If ML service is slow or unavailable: badge simply does not render — no error state shown inline

---

## Testing

### API — `apps/api/src/routes/trust-score.test.ts` (new)

- `GET /v1/trust-score` — mock Prisma counts, assert score = sum of category scores, assert breakdown has 4 categories
- `GET /v1/trust-score?history=true` — mock `OrgTrustScoreSnapshot.findMany`, assert `history` array present, ordered ascending by `recordedAt`
- `GET /v1/contacts/:id/trust-score` — mock Prisma contact + message + deal queries; mock `fetch` to ML service; assert `{ score, label }` returned

### Worker — `apps/api/src/workers/trust-score.test.ts` (new)

- Mock Prisma org ID query + `OrgTrustScoreSnapshot.create`
- Assert snapshot written with correct score for a known set of mocked counts
- Assert duplicate guard: snapshot not written if today's row already exists

### Frontend

No unit tests for UI components (consistent with existing web app pattern). Manual verification via `pnpm --filter @WBMSG/web dev`.

### Pre-existing skip

`apps/api/src/routes/analytics.test.ts` ECONNRESET timeout — not introduced or fixed by this work.

---

## Out of Scope

- Per-contact score history (no snapshot table for contacts)
- ML model retraining on real data (model uses synthetic training data — acceptable for now)
- Push notifications when org score drops
- Industry benchmark comparison
- Export of Trust Score data
