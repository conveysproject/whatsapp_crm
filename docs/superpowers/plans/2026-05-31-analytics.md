# Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-featured Analytics section at `/analytics` — a single page with five tabs (Overview, Conversations, Team, Campaigns, Predictive), shared date-range preset controls, per-agent drill-down panel, and CSV export.

**Architecture:** Single client shell component reads `?tab=X&days=N` from URL params and renders the active tab. All data is fetched client-side with `useAuth()` tokens, matching existing patterns. Three new API endpoints added to the existing `analyticsRouter`; two existing query functions extended to accept `days` param.

**Tech Stack:** Next.js 15 App Router (Server + Client Components), Fastify 4, Prisma, Redis (BullMQ cache), Recharts (already installed), Tailwind CSS.

---

## File Map

### Backend (modified / created)
| File | Action |
|------|--------|
| `apps/api/src/lib/analytics-queries.ts` | Modify: add `days` param to `getOverviewMetrics` + `getTeamStats`; add `getAgentDetail`, `getCampaignAnalytics`, `getConversationStatusBreakdown` |
| `apps/api/src/lib/analytics-queries.test.ts` | Modify: extend with new function tests |
| `apps/api/src/routes/analytics.ts` | Modify: pass `days` to overview + team routes; add `/agent/:id`, `/campaigns`, `/conversation-status`, `/export` routes |
| `apps/api/src/routes/analytics.test.ts` | Modify: extend mockPrisma + add route tests |

### Frontend (modified / created)
| File | Action |
|------|--------|
| `apps/web/components/layout/Sidebar.tsx` | Modify: Analytics href → `/analytics` |
| `apps/web/components/analytics/ConversationChart.tsx` | Modify: accept `days` prop |
| `apps/web/components/analytics/TeamLeaderboard.tsx` | Modify: accept `days` + `onAgentClick` props |
| `apps/web/components/analytics/DateRangeSelector.tsx` | Create |
| `apps/web/components/analytics/ExportButton.tsx` | Create |
| `apps/web/components/analytics/PredictiveTab.tsx` | Create (extracted from existing page) |
| `apps/web/app/(dashboard)/analytics/predictive/page.tsx` | Modify: delegate to PredictiveTab |
| `apps/web/components/analytics/OverviewTab.tsx` | Create |
| `apps/web/components/analytics/ConversationsTab.tsx` | Create |
| `apps/web/components/analytics/TeamTab.tsx` | Create |
| `apps/web/components/analytics/CampaignsTab.tsx` | Create |
| `apps/web/components/analytics/AnalyticsShell.tsx` | Create (tab shell, client) |
| `apps/web/app/(dashboard)/analytics/page.tsx` | Create (server wrapper) |

---

## Task 1: Update `getOverviewMetrics` + `getTeamStats` to accept `days` param

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write failing test for `getOverviewMetrics` with `days` param**

Add to `apps/api/src/lib/analytics-queries.test.ts` after the existing `getOverviewMetrics` describe block:

```ts
describe("getOverviewMetrics with days param", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("uses the provided days window for avgFirstResponseTime calculation", async () => {
    mockPrisma.conversation.count
      .mockResolvedValueOnce(3)   // open
      .mockResolvedValueOnce(1);  // bot
    mockPrisma.contact.count.mockResolvedValue(50);
    mockPrisma.message.count.mockResolvedValue(10);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(1);
    // outbound messages and convs produce a calculable avg
    const now = new Date();
    const convCreated = new Date(now.getTime() - 300_000); // 5 min ago
    const firstReply = new Date(now.getTime() - 240_000);  // 4 min ago (60s response)
    mockPrisma.message.findMany.mockResolvedValue([
      { conversationId: "c1", createdAt: firstReply },
    ]);
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: "c1", createdAt: convCreated },
    ]);

    const { getOverviewMetrics } = await import("./analytics-queries.js");
    const result = await getOverviewMetrics(mockPrisma as unknown as PrismaClient, "org-1", 7);

    expect(result.avgFirstResponseTime).toBe(60);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: FAIL — `getOverviewMetrics` does not accept a third argument yet (test may still pass depending on current sig). Proceed to implementation either way.

- [ ] **Step 3: Update `getOverviewMetrics` signature and internals**

In `apps/api/src/lib/analytics-queries.ts`, change:

```ts
export async function getOverviewMetrics(
  prisma: PrismaClient,
  organizationId: string
): Promise<OverviewMetrics> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
```

to:

```ts
export async function getOverviewMetrics(
  prisma: PrismaClient,
  organizationId: string,
  days = 30
): Promise<OverviewMetrics> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const since30d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
```

- [ ] **Step 4: Update `getTeamStats` signature and internals**

In the same file, change:

```ts
export async function getTeamStats(
  prisma: PrismaClient,
  organizationId: string
): Promise<AgentStats[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
```

to:

```ts
export async function getTeamStats(
  prisma: PrismaClient,
  organizationId: string,
  days = 30
): Promise<AgentStats[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
```

- [ ] **Step 5: Run tests to verify passing**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: All tests PASS (existing tests still pass because `days` defaults to 30).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(analytics): add days param to getOverviewMetrics and getTeamStats"
```

---

## Task 2: Add `getAgentDetail` query function

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getAgentDetail", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns resolved count, sla breaches, avg response, and top conversations", async () => {
    const now = new Date();
    const convCreated = new Date(now.getTime() - 120_000); // 2 min ago

    mockPrisma.conversation.count.mockResolvedValue(3); // resolvedCount
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([
        {
          id: "c1",
          createdAt: convCreated,
          slaId: null,
          sla: null,
          status: "open",
          lastMessageAt: now,
          contact: { name: "Rahul Sharma", firstName: null, lastName: null },
        },
      ])   // openConvs
      .mockResolvedValueOnce([
        { id: "c1", createdAt: convCreated },
      ]);  // convsSince

    mockPrisma.message.findMany
      .mockResolvedValueOnce([]) // firstOutbounds (no response time)
      .mockResolvedValueOnce([
        { conversationId: "c1", body: "Need help", contentType: "text", createdAt: now },
      ]); // lastMessages

    const { getAgentDetail } = await import("./analytics-queries.js");
    const result = await getAgentDetail(mockPrisma as unknown as PrismaClient, "org-1", "user-1", 30);

    expect(result.resolvedCount).toBe(3);
    expect(result.slaBreaches).toBe(0);
    expect(result.avgFirstResponseSecs).toBe(0);
    expect(result.topConversations).toHaveLength(1);
    expect(result.topConversations[0]!.contactName).toBe("Rahul Sharma");
    expect(result.topConversations[0]!.lastMessagePreview).toBe("Need help");
    expect(result.topConversations[0]!.status).toBe("open");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: FAIL — `getAgentDetail is not a function`.

- [ ] **Step 3: Add `getAgentDetail` to `analytics-queries.ts`**

Add after the `getTeamStats` function:

```ts
export interface AgentDetail {
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

export async function getAgentDetail(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  days: number
): Promise<AgentDetail> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [resolvedCount, openConvs, convsSince] = await Promise.all([
    prisma.conversation.count({
      where: { organizationId, assignedTo: userId, status: "resolved", closedAt: { gte: startOfDay } },
    }),
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: userId, status: { in: ["open", "pending"] } },
      select: {
        id: true,
        createdAt: true,
        slaId: true,
        sla: { select: { firstResponseSecs: true } },
        status: true,
        lastMessageAt: true,
        contact: { select: { name: true, firstName: true, lastName: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
    }),
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: userId, createdAt: { gte: since } },
      select: { id: true, createdAt: true },
    }),
  ]);

  const conv30dIds = convsSince.map((c) => c.id);
  const convCreatedMap = new Map(convsSince.map((c) => [c.id, c.createdAt]));

  const firstOutbounds = await prisma.message.findMany({
    where: { conversationId: { in: conv30dIds }, direction: "outbound", isSystemMessage: false },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstByConv = new Map<string, Date>();
  for (const m of firstOutbounds) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }

  let totalSecs = 0;
  let responseCount = 0;
  for (const [convId, firstAt] of firstByConv.entries()) {
    const created = convCreatedMap.get(convId);
    if (created) {
      totalSecs += (firstAt.getTime() - created.getTime()) / 1000;
      responseCount++;
    }
  }

  const slaBreaches = openConvs.filter(
    (c) => c.sla && c.createdAt.getTime() + c.sla.firstResponseSecs * 1000 < now.getTime()
  ).length;

  const topIds = openConvs.slice(0, 10).map((c) => c.id);
  const lastMessages = await prisma.message.findMany({
    where: { conversationId: { in: topIds }, isSystemMessage: false },
    select: { conversationId: true, body: true, contentType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastMsgMap = new Map<string, (typeof lastMessages)[0]>();
  for (const m of lastMessages) {
    if (!lastMsgMap.has(m.conversationId)) lastMsgMap.set(m.conversationId, m);
  }

  const topConversations = openConvs.map((c) => {
    const contact = c.contact;
    const contactName =
      contact?.name ??
      [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ??
      "Unknown";
    const lastMsg = lastMsgMap.get(c.id);
    let preview = "[Media]";
    if (lastMsg?.body) preview = lastMsg.body.slice(0, 60);
    else if (lastMsg?.contentType === "image") preview = "[Image]";
    else if (lastMsg?.contentType === "audio") preview = "[Audio]";
    return {
      id: c.id,
      contactName,
      lastMessagePreview: preview,
      status: c.status,
      lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
    };
  });

  return {
    resolvedCount,
    avgFirstResponseSecs: responseCount > 0 ? Math.round(totalSecs / responseCount) : 0,
    slaBreaches,
    topConversations,
  };
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(analytics): add getAgentDetail query"
```

---

## Task 3: Add `getCampaignAnalytics` query function

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getCampaignAnalytics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns campaigns with delivery and read rates", async () => {
    const sentAt = new Date("2026-05-28T10:00:00Z");
    mockPrisma.campaign.findMany.mockResolvedValue([
      { id: "camp-1", name: "May Promo", sentAt },
    ]);
    mockPrisma.campaignRecipient.groupBy.mockResolvedValue([
      { campaignId: "camp-1", status: "delivered", _count: { _all: 60 } },
      { campaignId: "camp-1", status: "read",      _count: { _all: 30 } },
      { campaignId: "camp-1", status: "failed",    _count: { _all: 10 } },
    ]);

    const { getCampaignAnalytics } = await import("./analytics-queries.js");
    const result = await getCampaignAnalytics(mockPrisma as unknown as PrismaClient, "org-1", 30);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("May Promo");
    expect(result[0]!.totalSent).toBe(100);
    // delivered = "delivered" + "read" = 90
    expect(result[0]!.delivered).toBe(90);
    expect(result[0]!.read).toBe(30);
    expect(result[0]!.failed).toBe(10);
    expect(result[0]!.deliveryRate).toBe(90);
    expect(result[0]!.readRate).toBe(30);
  });

  it("returns empty array when no campaigns in period", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    const { getCampaignAnalytics } = await import("./analytics-queries.js");
    const result = await getCampaignAnalytics(mockPrisma as unknown as PrismaClient, "org-1", 7);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: FAIL — `getCampaignAnalytics is not a function`.

- [ ] **Step 3: Add `getCampaignAnalytics` to `analytics-queries.ts`**

Add after `getAgentDetail`:

```ts
export interface CampaignAnalyticsItem {
  id: string;
  name: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
}

export async function getCampaignAnalytics(
  prisma: PrismaClient,
  organizationId: string,
  days: number
): Promise<CampaignAnalyticsItem[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const campaigns = await prisma.campaign.findMany({
    where: { organizationId, status: "completed", sentAt: { gte: since } },
    select: { id: true, name: true, sentAt: true },
    orderBy: { sentAt: "desc" },
  });

  if (campaigns.length === 0) return [];

  const recipientGroups = await prisma.campaignRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    _count: { _all: true },
  });

  const byId = new Map<string, Map<string, number>>();
  for (const r of recipientGroups) {
    if (!byId.has(r.campaignId)) byId.set(r.campaignId, new Map());
    byId.get(r.campaignId)!.set(r.status, r._count._all);
  }

  const deliveredStatuses: CampaignRecipientStatus[] = ["delivered", "read", "played"];

  return campaigns.map((c) => {
    const statusMap = byId.get(c.id) ?? new Map<string, number>();
    const delivered = deliveredStatuses.reduce((sum, s) => sum + (statusMap.get(s) ?? 0), 0);
    const read = statusMap.get("read") ?? 0;
    const failed = statusMap.get("failed") ?? 0;
    const totalSent = [...statusMap.values()].reduce((a, b) => a + b, 0);
    const deliveryRate = totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0;
    const readRate = totalSent > 0 ? Math.round((read / totalSent) * 100) : 0;
    return {
      id: c.id,
      name: c.name,
      sentAt: c.sentAt?.toISOString() ?? "",
      totalSent,
      delivered,
      read,
      failed,
      deliveryRate,
      readRate,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(analytics): add getCampaignAnalytics query"
```

---

## Task 4: Add `getConversationStatusBreakdown` query function

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getConversationStatusBreakdown", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns counts per status for conversations active in the period", async () => {
    mockPrisma.conversation.groupBy.mockResolvedValue([
      { status: "open",     _count: { _all: 12 } },
      { status: "resolved", _count: { _all: 45 } },
      { status: "bot",      _count: { _all: 5 } },
    ]);

    const { getConversationStatusBreakdown } = await import("./analytics-queries.js");
    const result = await getConversationStatusBreakdown(mockPrisma as unknown as PrismaClient, "org-1", 14);

    expect(result.open).toBe(12);
    expect(result.resolved).toBe(45);
    expect(result.bot).toBe(5);
    expect(result.pending).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: FAIL — `getConversationStatusBreakdown is not a function`.

- [ ] **Step 3: Add `getConversationStatusBreakdown` to `analytics-queries.ts`**

Add after `getCampaignAnalytics`:

```ts
export interface ConversationStatusBreakdown {
  open: number;
  pending: number;
  bot: number;
  resolved: number;
}

export async function getConversationStatusBreakdown(
  prisma: PrismaClient,
  organizationId: string,
  days: number
): Promise<ConversationStatusBreakdown> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const groups = await prisma.conversation.groupBy({
    by: ["status"],
    where: { organizationId, lastMessageAt: { gte: since } },
    _count: { _all: true },
  });

  const countByStatus = new Map(groups.map((g) => [g.status, g._count._all]));

  return {
    open: countByStatus.get("open") ?? 0,
    pending: countByStatus.get("pending") ?? 0,
    bot: countByStatus.get("bot") ?? 0,
    resolved: countByStatus.get("resolved") ?? 0,
  };
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
pnpm --filter @WBMSG/api test src/lib/analytics-queries.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(analytics): add getConversationStatusBreakdown query"
```

---

## Task 5: Update existing routes + add new API routes

**Files:**
- Modify: `apps/api/src/routes/analytics.ts`
- Modify: `apps/api/src/routes/analytics.test.ts`

- [ ] **Step 1: Extend `mockPrisma` in `analytics.test.ts` and add route tests**

Replace the entire `apps/api/src/routes/analytics.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  conversation: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  contact: { count: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  invitation: { count: vi.fn() },
  campaign: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  campaignRecipient: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { analyticsRouter } = await import("./analytics.js");
  await app.register(analyticsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/analytics/overview", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns overview metrics", async () => {
    mockPrisma.conversation.count.mockResolvedValue(42);
    mockPrisma.contact.count.mockResolvedValue(100);
    mockPrisma.message.count.mockResolvedValue(120);
    mockPrisma.invitation.count.mockResolvedValue(5);
    mockPrisma.campaign.count.mockResolvedValue(2);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview?days=7" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { openConversations: number } }>();
    expect(typeof body.data.openConversations).toBe("number");
  });
});

describe("GET /v1/analytics/agent/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns agent detail data", async () => {
    mockPrisma.conversation.count.mockResolvedValue(2);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/agent/u-1?days=30" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { resolvedCount: number } }>();
    expect(typeof body.data.resolvedCount).toBe("number");
  });
});

describe("GET /v1/analytics/campaigns", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns campaign analytics list", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/campaigns?days=30" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("GET /v1/analytics/conversation-status", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns status breakdown", async () => {
    mockPrisma.conversation.groupBy.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/conversation-status?days=14" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { open: number; resolved: number } }>();
    expect(typeof body.data.open).toBe("number");
    expect(typeof body.data.resolved).toBe("number");
  });
});

describe("GET /v1/analytics/export", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns CSV for conversations tab", async () => {
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=conversations&days=7" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("date,inbound,outbound");
  });

  it("returns CSV for team tab", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=team&days=30" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("agent,open_conversations");
  });

  it("returns 400 for invalid tab", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=invalid&days=7" });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
pnpm --filter @WBMSG/api test src/routes/analytics.test.ts
```

Expected: FAIL — new routes not registered yet.

- [ ] **Step 3: Replace `apps/api/src/routes/analytics.ts` with the updated version**

```ts
import type { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamStats,
  getMyWork,
  getCampaignSnapshot,
  getActivityFeed,
  getAgentDetail,
  getCampaignAnalytics,
  getConversationStatusBreakdown,
} from "../lib/analytics-queries.js";
import { cacheGet, cacheSet, orgKey } from "../lib/cache.js";

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:overview:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const metrics = await getOverviewMetrics(fastify.prisma, organizationId, days);
    await cacheSet(key, metrics, 120);
    return reply.send({ data: metrics });
  });

  fastify.get("/analytics/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "14", 10);
    const key = orgKey(organizationId, `analytics:conversations:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const volume = await getConversationVolume(fastify.prisma, organizationId, days);
    await cacheSet(key, volume, 120);
    return reply.send({ data: volume });
  });

  fastify.get("/analytics/team", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:team:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const stats = await getTeamStats(fastify.prisma, organizationId, days);
    await cacheSet(key, stats, 120);
    return reply.send({ data: stats });
  });

  fastify.get("/analytics/my-work", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const key = orgKey(organizationId, `analytics:my-work:${userId}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getMyWork(fastify.prisma, organizationId, userId);
    await cacheSet(key, data, 60);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/campaign-snapshot", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:campaign-snapshot");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getCampaignSnapshot(fastify.prisma, organizationId);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/activity-feed", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:activity-feed");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getActivityFeed(fastify.prisma, organizationId);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/agent/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const params = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:agent:${params.id}:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getAgentDetail(fastify.prisma, organizationId, params.id, days);
    await cacheSet(key, data, 60);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:campaigns:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getCampaignAnalytics(fastify.prisma, organizationId, days);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/conversation-status", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:conv-status:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getConversationStatusBreakdown(fastify.prisma, organizationId, days);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/export", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const tab = query["tab"] ?? "overview";
    const days = parseInt(query["days"] ?? "30", 10);
    const filename = `analytics-${tab}-${days}d.csv`;

    let csv = "";

    if (tab === "overview") {
      const metrics = await getOverviewMetrics(fastify.prisma, organizationId, days);
      csv = "metric,value\n";
      csv += `open_conversations,${metrics.openConversations}\n`;
      csv += `total_contacts,${metrics.totalContacts}\n`;
      csv += `messages_today,${metrics.messagesToday}\n`;
      csv += `campaigns_this_month,${metrics.campaignsSentThisMonth}\n`;
      csv += `avg_first_response_secs,${metrics.avgFirstResponseTime}\n`;
      csv += `bot_conversations,${metrics.botConversations}\n`;
    } else if (tab === "conversations") {
      const volume = await getConversationVolume(fastify.prisma, organizationId, days);
      csv = "date,inbound,outbound\n";
      csv += volume.map((r) => `${r.date},${r.inbound},${r.outbound}`).join("\n");
    } else if (tab === "team") {
      const stats = await getTeamStats(fastify.prisma, organizationId, days);
      csv = "agent,open_conversations,resolved_today,avg_first_response_secs,sla_breaches\n";
      csv += stats
        .map((r) => `"${r.displayName}",${r.openConversations},${r.resolvedToday},${r.avgFirstResponseSecs},${r.slaBreaches}`)
        .join("\n");
    } else if (tab === "campaigns") {
      const camps = await getCampaignAnalytics(fastify.prisma, organizationId, days);
      csv = "name,sent_at,total_sent,delivered,read,failed,delivery_rate,read_rate\n";
      csv += camps
        .map((r) => `"${r.name}",${r.sentAt},${r.totalSent},${r.delivered},${r.read},${r.failed},${r.deliveryRate},${r.readRate}`)
        .join("\n");
    } else {
      return reply.status(400).send({ error: "Invalid tab. Must be one of: overview, conversations, team, campaigns" });
    }

    void reply.header("Content-Type", "text/csv");
    void reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(csv);
  });
};
```

- [ ] **Step 4: Run tests to verify passing**

```bash
pnpm --filter @WBMSG/api test src/routes/analytics.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Type-check the API**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/analytics.ts apps/api/src/routes/analytics.test.ts
git commit -m "feat(analytics): add agent detail, campaigns, conversation-status, and export routes"
```

---

## Task 6: Update Sidebar, ConversationChart, TeamLeaderboard

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx`
- Modify: `apps/web/components/analytics/ConversationChart.tsx`
- Modify: `apps/web/components/analytics/TeamLeaderboard.tsx`

- [ ] **Step 1: Update Sidebar Analytics nav item**

In `apps/web/components/layout/Sidebar.tsx`, change line 42:

```ts
{ href: "/analytics/predictive",label: "Analytics",   icon: "📊" },
```

to:

```ts
{ href: "/analytics",            label: "Analytics",   icon: "📊" },
```

- [ ] **Step 2: Update `ConversationChart.tsx` to accept `days` prop**

Replace the entire `apps/web/components/analytics/ConversationChart.tsx` with:

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface DailyVolume { date: string; inbound: number; outbound: number; }

interface ConversationChartProps {
  days?: number;
}

export function ConversationChart({ days = 14 }: ConversationChartProps): JSX.Element {
  const [data, setData] = useState<DailyVolume[]>([]);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/conversations?days=${days}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
      if (res.ok) setData((await res.json() as { data: DailyVolume[] }).data);
    }
    void load();
  }, [getToken, days]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Message Volume ({days} days)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inbound" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outbound" fill="#86efac" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Update `TeamLeaderboard.tsx` to accept `days` and `onAgentClick` props**

Replace the entire `apps/web/components/analytics/TeamLeaderboard.tsx` with:

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface AgentStats {
  userId: string;
  displayName: string;
  openConversations: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
}

type SortKey = keyof Omit<AgentStats, "userId" | "displayName">;

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

interface TeamLeaderboardProps {
  days?: number;
  onAgentClick?: (userId: string) => void;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function TeamLeaderboard({ days = 30, onAgentClick }: TeamLeaderboardProps): JSX.Element {
  const [data, setData] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("resolvedToday");
  const [sortAsc, setSortAsc] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/team?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: AgentStats[] }).data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken, days]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...data].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });

  const cols: { key: SortKey; label: string }[] = [
    { key: "openConversations", label: "Open" },
    { key: "resolvedToday", label: "Resolved Today" },
    { key: "avgFirstResponseSecs", label: "Avg Response" },
    { key: "slaBreaches", label: "SLA Breaches" },
  ];

  if (loading) return <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Team Leaderboard</h3>
      </div>
      {sorted.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">No activity yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-2 font-medium text-gray-600">Agent</th>
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className="text-right px-4 py-2 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
                    onClick={() => { handleSort(col.key); }}
                  >
                    {col.label} {sortKey === col.key ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((agent) => (
                <tr
                  key={agent.userId}
                  className={`hover:bg-gray-50 ${onAgentClick ? "cursor-pointer" : ""}`}
                  onClick={() => { onAgentClick?.(agent.userId); }}
                >
                  <td className="px-5 py-2.5 font-medium text-gray-900 whitespace-nowrap">{agent.displayName}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{agent.openConversations}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-green-700">{agent.resolvedToday}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatDuration(agent.avgFirstResponseSecs)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${agent.slaBreaches > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {agent.slaBreaches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check the web app**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/Sidebar.tsx apps/web/components/analytics/ConversationChart.tsx apps/web/components/analytics/TeamLeaderboard.tsx
git commit -m "feat(analytics): update sidebar href; add days + onAgentClick props to charts"
```

---

## Task 7: Create `DateRangeSelector` and `ExportButton`

**Files:**
- Create: `apps/web/components/analytics/DateRangeSelector.tsx`
- Create: `apps/web/components/analytics/ExportButton.tsx`

- [ ] **Step 1: Create `DateRangeSelector.tsx`**

```tsx
"use client";

import { JSX } from "react";

const PRESETS = [7, 14, 30, 90] as const;

interface DateRangeSelectorProps {
  days: number;
  onChange: (days: number) => void;
}

export function DateRangeSelector({ days, onChange }: DateRangeSelectorProps): JSX.Element {
  return (
    <div className="flex gap-1">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => { onChange(p); }}
          className={[
            "px-3 py-1 text-xs font-medium rounded-full transition-colors",
            days === p
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          ].join(" ")}
        >
          {p}d
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `ExportButton.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface ExportButtonProps {
  tab: string;
  days: number;
  disabled?: boolean;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function ExportButton({ tab, days, disabled }: ExportButtonProps): JSX.Element {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/analytics/export?tab=${tab}&days=${days}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${tab}-${days}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => { void handleExport(); }}
        disabled={disabled || loading}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Exporting..." : "Export CSV"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/analytics/DateRangeSelector.tsx apps/web/components/analytics/ExportButton.tsx
git commit -m "feat(analytics): add DateRangeSelector and ExportButton components"
```

---

## Task 8: Create `PredictiveTab` and update predictive page

**Files:**
- Create: `apps/web/components/analytics/PredictiveTab.tsx`
- Modify: `apps/web/app/(dashboard)/analytics/predictive/page.tsx`

- [ ] **Step 1: Create `PredictiveTab.tsx`**

The content is extracted verbatim from the existing `predictive/page.tsx`. Copy the entire file content into a component file:

```tsx
"use client";
import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface PredictiveContact {
  id: string;
  name: string;
  phone: string;
  trustScore: number | null;
  riskLevel: "high" | "medium" | "low";
}

interface PredictiveData {
  churnRisk: PredictiveContact[];
  highValue: PredictiveContact[];
  reorderCandidates: PredictiveContact[];
}

const riskBadgeClass: Record<PredictiveContact["riskLevel"], string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-yellow-600 bg-yellow-50",
  low: "text-green-600 bg-green-50",
};

function SectionDot({ color }: { color: string }): JSX.Element {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} mr-2`} />;
}

function ContactRow({
  c,
  showTrustScore,
  trustScoreColor,
}: {
  c: PredictiveContact;
  showTrustScore: boolean;
  trustScoreColor?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-medium text-sm truncate">{c.name || c.phone}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${riskBadgeClass[c.riskLevel]}`}>
          {c.riskLevel}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {showTrustScore && c.trustScore !== null && (
          <span className={`text-sm font-semibold ${trustScoreColor ?? "text-gray-700"}`}>
            {c.trustScore}
          </span>
        )}
        <Link href={`/contacts/${c.id}`} className="text-xs text-blue-600 hover:underline">
          View
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  dotColor,
  contacts,
  emptyMessage,
  showTrustScore,
  trustScoreColor,
}: {
  title: string;
  dotColor: string;
  contacts: PredictiveContact[];
  emptyMessage: string;
  showTrustScore: boolean;
  trustScoreColor?: string;
}): JSX.Element {
  const visible = contacts.slice(0, 10);
  return (
    <div className="bg-white border rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center">
          <SectionDot color={dotColor} />
          {title}
        </h2>
        <span className="text-sm text-gray-500">
          {contacts.length > 10 ? `${contacts.length} (showing 10)` : `${contacts.length}`} contacts
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      ) : (
        <div>
          {visible.map((c) => (
            <ContactRow key={c.id} c={c} showTrustScore={showTrustScore} trustScoreColor={trustScoreColor} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PredictiveTab(): JSX.Element {
  const { getToken } = useAuth();
  const [data, setData] = useState<PredictiveData>({ churnRisk: [], highValue: [], reorderCandidates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        const res = await fetch(`${apiUrl}/v1/ai/predictive`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) {
          if (!cancelled) { setError("Failed to load predictive data."); setLoading(false); }
          return;
        }
        const json = (await res.json()) as { data: PredictiveData };
        if (!cancelled) { setData(json.data); setLoading(false); }
      } catch {
        if (!cancelled) { setError("Network error. Please try again."); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Analysing your contacts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
      <Section title="Churn Risk" dotColor="bg-red-500" contacts={data.churnRisk} emptyMessage="No contacts at churn risk." showTrustScore />
      <Section title="High Value" dotColor="bg-green-500" contacts={data.highValue} emptyMessage="No high-value contacts identified." showTrustScore trustScoreColor="text-green-600" />
      <Section title="Reorder Candidates" dotColor="bg-blue-500" contacts={data.reorderCandidates} emptyMessage="No reorder candidates." showTrustScore={false} />
    </div>
  );
}
```

- [ ] **Step 2: Update `predictive/page.tsx` to delegate to `PredictiveTab`**

Replace the entire `apps/web/app/(dashboard)/analytics/predictive/page.tsx` with:

```tsx
import { JSX } from "react";
import { PredictiveTab } from "@/components/analytics/PredictiveTab";

export default function PredictiveAnalyticsPage(): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Predictive Analytics</h1>
      <PredictiveTab />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/analytics/PredictiveTab.tsx apps/web/app/(dashboard)/analytics/predictive/page.tsx
git commit -m "feat(analytics): extract PredictiveTab component"
```

---

## Task 9: Create `OverviewTab`

**Files:**
- Create: `apps/web/components/analytics/OverviewTab.tsx`

- [ ] **Step 1: Create `OverviewTab.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { OrgMetricCards } from "./OrgMetricCards";
import { ConversationChart } from "./ConversationChart";
import { CampaignSnapshot } from "./CampaignSnapshot";
import { ActivityFeed } from "./ActivityFeed";

interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OverviewTabProps {
  days: number;
}

export function OverviewTab({ days }: OverviewTabProps): JSX.Element {
  const { getToken } = useAuth();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/overview?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          setMetrics((await res.json() as { data: OverviewMetrics }).data);
        } else {
          setError("Failed to load overview metrics.");
        }
      } catch {
        setError("Network error loading overview.");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    void load();
  }, [getToken, days]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
      {metrics && (
        <OrgMetricCards
          openConversations={metrics.openConversations}
          totalContacts={metrics.totalContacts}
          messagesToday={metrics.messagesToday}
          campaignsSentThisMonth={metrics.campaignsSentThisMonth}
          avgFirstResponseTime={metrics.avgFirstResponseTime}
          botConversations={metrics.botConversations}
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversationChart days={days} />
        <CampaignSnapshot />
      </div>
      <ActivityFeed />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/OverviewTab.tsx
git commit -m "feat(analytics): add OverviewTab component"
```

---

## Task 10: Create `ConversationsTab`

**Files:**
- Create: `apps/web/components/analytics/ConversationsTab.tsx`

- [ ] **Step 1: Create `ConversationsTab.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface DailyVolume { date: string; inbound: number; outbound: number; }
interface StatusBreakdown { open: number; pending: number; bot: number; resolved: number; }

const STATUS_COLORS: Record<keyof StatusBreakdown, string> = {
  open: "#3b82f6",
  pending: "#f59e0b",
  bot: "#8b5cf6",
  resolved: "#22c55e",
};

interface ConversationsTabProps {
  days: number;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function ConversationsTab({ days }: ConversationsTabProps): JSX.Element {
  const { getToken } = useAuth();
  const [volume, setVolume] = useState<DailyVolume[]>([]);
  const [status, setStatus] = useState<StatusBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token ?? ""}` };
        const [volRes, statusRes] = await Promise.all([
          fetch(`${API_BASE}/v1/analytics/conversations?days=${days}`, { headers }),
          fetch(`${API_BASE}/v1/analytics/conversation-status?days=${days}`, { headers }),
        ]);
        if (volRes.ok) setVolume((await volRes.json() as { data: DailyVolume[] }).data);
        if (statusRes.ok) setStatus((await statusRes.json() as { data: StatusBreakdown }).data);
        if (!volRes.ok && !statusRes.ok) setError("Failed to load conversation data.");
      } catch {
        setError("Network error loading conversations.");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    void load();
  }, [getToken, days]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const pieData = status
    ? (Object.entries(status) as [keyof StatusBreakdown, number][])
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({ name: key, value }))
    : [];

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line chart — message volume */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Message Volume ({days}d)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={volume} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="inbound" stroke="#22c55e" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="outbound" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Status Breakdown ({days}d)</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center pt-16">No conversations in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name as keyof StatusBreakdown] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [value, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/ConversationsTab.tsx
git commit -m "feat(analytics): add ConversationsTab with line chart and status donut"
```

---

## Task 11: Create `TeamTab` with agent drill-down panel

**Files:**
- Create: `apps/web/components/analytics/TeamTab.tsx`

- [ ] **Step 1: Create `TeamTab.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { TeamLeaderboard } from "./TeamLeaderboard";
import Link from "next/link";

interface AgentConversation {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  status: string;
  lastMessageAt: string;
}

interface AgentDetail {
  resolvedCount: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: AgentConversation[];
}

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function AgentPanel({
  userId,
  days,
  onClose,
}: {
  userId: string;
  days: number;
  onClose: () => void;
}): JSX.Element {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/agent/${userId}?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          setDetail((await res.json() as { data: AgentDetail }).data);
        } else {
          setError("Failed to load agent details.");
        }
      } catch {
        setError("Network error loading agent details.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken, userId, days, API_BASE]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Slide-in panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Agent Detail</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
              <button
                onClick={() => { setError(null); setLoading(true); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {detail && !loading && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{detail.resolvedCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Resolved Today</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{formatDuration(detail.avgFirstResponseSecs)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Avg Response</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className={`text-2xl font-bold ${detail.slaBreaches > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {detail.slaBreaches}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">SLA Breaches</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Active Conversations</h3>
                {detail.topConversations.length === 0 ? (
                  <p className="text-sm text-gray-400">No open conversations.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.topConversations.map((conv) => (
                      <Link
                        key={conv.id}
                        href={`/inbox?conversation=${conv.id}`}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessagePreview}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          conv.status === "open" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {conv.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

interface TeamTabProps {
  days: number;
}

export function TeamTab({ days }: TeamTabProps): JSX.Element {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <TeamLeaderboard days={days} onAgentClick={(id) => { setSelectedAgentId(id); }} />
      <p className="text-xs text-gray-400">Click an agent row to see their open conversations and performance detail.</p>

      {selectedAgentId && (
        <AgentPanel
          userId={selectedAgentId}
          days={days}
          onClose={() => { setSelectedAgentId(null); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/TeamTab.tsx
git commit -m "feat(analytics): add TeamTab with agent drill-down panel"
```

---

## Task 12: Create `CampaignsTab`

**Files:**
- Create: `apps/web/components/analytics/CampaignsTab.tsx`

- [ ] **Step 1: Create `CampaignsTab.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface CampaignAnalyticsItem {
  id: string;
  name: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
}

function DeliveryBar({ deliveryRate, readRate }: { deliveryRate: number; readRate: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="h-full bg-blue-200 rounded-full" style={{ width: `${deliveryRate}%` }} />
        <div className="h-full bg-blue-600 rounded-full absolute top-0 left-0" style={{ width: `${readRate}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums shrink-0">{deliveryRate}%</span>
    </div>
  );
}

interface CampaignsTabProps {
  days: number;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function CampaignsTab({ days }: CampaignsTabProps): JSX.Element {
  const { getToken } = useAuth();
  const [data, setData] = useState<CampaignAnalyticsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/campaigns?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          setData((await res.json() as { data: CampaignAnalyticsItem[] }).data);
        } else {
          setError("Failed to load campaign data.");
        }
      } catch {
        setError("Network error loading campaigns.");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    void load();
  }, [getToken, days]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {data.length === 0 && !error ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">No campaigns sent in the last {days} days.</p>
          <Link href="/campaigns/new" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Campaign</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Sent</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Delivered</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Read</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Failed</th>
                  <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Delivery Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 truncate block max-w-[200px]">
                        {c.name}
                      </Link>
                      <span className="text-xs text-gray-400">
                        {new Date(c.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{c.totalSent}</td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{c.delivered}</td>
                    <td className="px-4 py-3 text-right text-blue-700 font-medium tabular-nums">{c.read}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${c.failed > 0 ? "text-red-500" : "text-gray-400"}`}>
                      {c.failed}
                    </td>
                    <td className="px-4 py-3">
                      <DeliveryBar deliveryRate={c.deliveryRate} readRate={c.readRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/CampaignsTab.tsx
git commit -m "feat(analytics): add CampaignsTab with delivery rate table"
```

---

## Task 13: Create `AnalyticsShell` and `analytics/page.tsx`

**Files:**
- Create: `apps/web/components/analytics/AnalyticsShell.tsx`
- Create: `apps/web/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Create `AnalyticsShell.tsx`**

```tsx
"use client";

import { JSX } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DateRangeSelector } from "./DateRangeSelector";
import { ExportButton } from "./ExportButton";
import { OverviewTab } from "./OverviewTab";
import { ConversationsTab } from "./ConversationsTab";
import { TeamTab } from "./TeamTab";
import { CampaignsTab } from "./CampaignsTab";
import { PredictiveTab } from "./PredictiveTab";

type Tab = "overview" | "conversations" | "team" | "campaigns" | "predictive";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",      label: "Overview" },
  { id: "conversations", label: "Conversations" },
  { id: "team",          label: "Team" },
  { id: "campaigns",     label: "Campaigns" },
  { id: "predictive",    label: "Predictive" },
];

const VALID_DAYS = [7, 14, 30, 90];

export function AnalyticsShell(): JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "overview";
  const tab: Tab = (["overview", "conversations", "team", "campaigns", "predictive"].includes(rawTab)
    ? rawTab
    : "overview") as Tab;

  const rawDays = parseInt(searchParams.get("days") ?? "30", 10);
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 30;

  function setTab(newTab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", newTab);
    router.replace(`/analytics?${params.toString()}`);
  }

  function setDays(newDays: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", String(newDays));
    router.replace(`/analytics?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <ExportButton tab={tab} days={days} disabled={tab === "predictive"} />
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); }}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                tab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Date range selector (hidden on Predictive tab) */}
      {tab !== "predictive" && (
        <DateRangeSelector days={days} onChange={setDays} />
      )}

      {/* Active tab content */}
      {tab === "overview"      && <OverviewTab days={days} />}
      {tab === "conversations" && <ConversationsTab days={days} />}
      {tab === "team"          && <TeamTab days={days} />}
      {tab === "campaigns"     && <CampaignsTab days={days} />}
      {tab === "predictive"    && <PredictiveTab />}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/analytics/page.tsx`**

```tsx
import { JSX, Suspense } from "react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";

export default function AnalyticsPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="h-8 bg-gray-100 rounded animate-pulse w-48" />}>
      <AnalyticsShell />
    </Suspense>
  );
}
```

- [ ] **Step 3: Type-check the full web app**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 4: Run API tests one final time**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests PASS (the pre-existing analytics.test.ts failure in CLAUDE.md is now resolved since the test was rewritten to use `app.inject()`).

- [ ] **Step 5: Lint both apps**

```bash
pnpm lint
```

Expected: No errors (warnings acceptable).

- [ ] **Step 6: Final commit**

```bash
git add apps/web/components/analytics/AnalyticsShell.tsx apps/web/app/(dashboard)/analytics/page.tsx
git commit -m "feat(analytics): add AnalyticsShell tab shell and analytics page — Analytics feature complete"
```

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | `getOverviewMetrics` + `getTeamStats` accept `days` param |
| 2 | `getAgentDetail` query |
| 3 | `getCampaignAnalytics` query |
| 4 | `getConversationStatusBreakdown` query |
| 5 | 4 new routes + updated existing routes + full route tests |
| 6 | Sidebar, ConversationChart, TeamLeaderboard updated |
| 7 | DateRangeSelector + ExportButton |
| 8 | PredictiveTab extracted + predictive page simplified |
| 9 | OverviewTab |
| 10 | ConversationsTab (line chart + donut) |
| 11 | TeamTab + agent drill-down panel |
| 12 | CampaignsTab |
| 13 | AnalyticsShell + `/analytics` page |
