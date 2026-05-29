# Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal 4-card dashboard with a role-adaptive next-generation page — agents see their personal work queue + performance scorecard, admins/managers see a full org overview with campaign snapshot, rich team leaderboard, and activity feed.

**Architecture:** Single-scroll page in four zones (Header, Quick Actions, My Work, Org Overview). Role check is server-side in `DashboardPage` — agents never fetch Org Overview data. Client components are self-fetching; the server component provides overview metrics and role as props. Five API endpoint changes (2 extended, 3 new) + one new `/v1/users/me` endpoint for role/name resolution.

**Tech Stack:** Next.js 15 App Router (server + client components), React Query style self-fetching hooks, Fastify 4, Prisma, Recharts (existing), Tailwind CSS.

---

## File Map

### API — new/modified
| File | Change |
|---|---|
| `apps/api/src/routes/users.ts` | Add `GET /users/me` |
| `apps/api/src/routes/users.test.ts` | Add test for `/users/me` |
| `apps/api/src/lib/analytics-queries.ts` | Extend `getOverviewMetrics`; add `getMyWork`, `getTeamStats`, `getCampaignSnapshot`, `getActivityFeed`; remove `getTeamPerformance` |
| `apps/api/src/lib/analytics-queries.test.ts` | New — unit tests for all new query functions |
| `apps/api/src/routes/analytics.ts` | Wire new routes; update `/team` to use `getTeamStats` |

### Web — new components
| File | Purpose |
|---|---|
| `apps/web/components/analytics/OrgMetricCards.tsx` | 6-card org metric grid (props-driven) |
| `apps/web/components/analytics/QuickActions.tsx` | 4 static action buttons |
| `apps/web/components/analytics/MyWorkSection.tsx` | My Work zone (stat chips + conversation previews + performance cards) |
| `apps/web/components/analytics/CampaignSnapshot.tsx` | Last campaign delivery bar + next scheduled |
| `apps/web/components/analytics/TeamLeaderboard.tsx` | Sortable agent stats table (replaces TeamTable) |
| `apps/web/components/analytics/ActivityFeed.tsx` | Recent org events list |

### Web — modified
| File | Change |
|---|---|
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Fetch role + firstName + wabaConnected; role-gate Org Overview; render new layout |

---

## Task 1: Add `GET /v1/users/me` endpoint

**Files:**
- Modify: `apps/api/src/routes/users.ts`
- Modify: `apps/api/src/routes/users.test.ts`

- [ ] **Step 1: Write the failing test**

Open `apps/api/src/routes/users.test.ts`. The existing mock only has `user.findMany` and `user.update`. Add `user.findFirst` and a new describe block:

```ts
// Add findFirst to the mockPrisma object at the top of the file:
const mockPrisma = {
  user: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  organizationMember: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

// Add at the bottom of the file:
describe("GET /v1/users/me", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns current user id, fullName, email and role", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      fullName: "Rahul Sharma",
      email: "rahul@test.com",
      role: "admin",
    });
    const res = await app.inject({ method: "GET", url: "/v1/users/me" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { id: string; fullName: string; email: string; role: string } };
    expect(body.data.id).toBe("user-1");
    expect(body.data.fullName).toBe("Rahul Sharma");
    expect(body.data.role).toBe("admin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose users.test
```

Expected: FAIL — "GET /v1/users/me returns current user..." not passing (404).

- [ ] **Step 3: Add the route to `apps/api/src/routes/users.ts`**

Add before the `patch("/users/:id/role"` handler (after the `GET /users` handler):

```ts
  fastify.get("/users/me", async (request) => {
    const user = await fastify.prisma.user.findFirst({
      where: { id: request.auth.userId, organizationId: request.auth.organizationId, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
    });
    if (!user) return { data: null };
    return { data: user };
  });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose users.test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/users.ts apps/api/src/routes/users.test.ts
git commit -m "feat(api): add GET /v1/users/me for role and display name"
```

---

## Task 2: Extend overview metrics with 3 new fields

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Create: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Create the test file with a failing test**

Create `apps/api/src/lib/analytics-queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// We import after vi.mock so the mock is in place
vi.mock("./prisma.js", () => ({ prisma: {} }));

const mockPrisma = {
  conversation: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  contact: { count: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  invitation: { count: vi.fn() },
  campaign: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  campaignRecipient: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
};

describe("getOverviewMetrics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 7 metrics including the 3 new fields", async () => {
    mockPrisma.conversation.count
      .mockResolvedValueOnce(5)   // openConversations
      .mockResolvedValueOnce(2);  // botConversations
    mockPrisma.contact.count.mockResolvedValue(100);
    mockPrisma.message.count.mockResolvedValue(30);
    mockPrisma.invitation.count.mockResolvedValue(1);
    mockPrisma.campaign.count.mockResolvedValue(3);
    mockPrisma.message.findMany.mockResolvedValue([]); // no outbound msgs → avgFirstResponseTime = 0
    mockPrisma.conversation.findMany.mockResolvedValue([]); // no convs → avgFirstResponseTime = 0

    const { getOverviewMetrics } = await import("./analytics-queries.js");
    const result = await getOverviewMetrics(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result.openConversations).toBe(5);
    expect(result.totalContacts).toBe(100);
    expect(result.messagesToday).toBe(30);
    expect(result.pendingInvitations).toBe(1);
    expect(result.campaignsSentThisMonth).toBe(3);
    expect(result.avgFirstResponseTime).toBe(0);
    expect(result.botConversations).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: FAIL — test fails because `getOverviewMetrics` doesn't return the 3 new fields yet.

- [ ] **Step 3: Update `OverviewMetrics` interface and `getOverviewMetrics` in `apps/api/src/lib/analytics-queries.ts`**

Replace the existing `OverviewMetrics` interface and `getOverviewMetrics` function:

```ts
export interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  pendingInvitations: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

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

  const [
    openConversations,
    totalContacts,
    messagesToday,
    pendingInvitations,
    campaignsSentThisMonth,
    botConversations,
    outboundMsgs,
    convs30d,
  ] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "open" } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.message.count({ where: { organizationId, createdAt: { gte: startOfDay } } }),
    prisma.invitation.count({ where: { organizationId, status: "pending" } }),
    prisma.campaign.count({
      where: { organizationId, status: "completed", sentAt: { gte: startOfMonth } },
    }),
    prisma.conversation.count({
      where: { organizationId, status: "bot", lastMessageAt: { gte: startOfDay } },
    }),
    prisma.message.findMany({
      where: { organizationId, direction: "outbound", isSystemMessage: false, createdAt: { gte: since30d } },
      select: { conversationId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.conversation.findMany({
      where: { organizationId, createdAt: { gte: since30d } },
      select: { id: true, createdAt: true },
    }),
  ]);

  // Avg first response time (org-wide, last 30 days)
  const firstByConv = new Map<string, Date>();
  for (const m of outboundMsgs) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }
  const convCreatedMap = new Map(convs30d.map((c) => [c.id, c.createdAt]));
  let totalSecs = 0;
  let responseCount = 0;
  for (const [convId, firstAt] of firstByConv.entries()) {
    const convCreated = convCreatedMap.get(convId);
    if (convCreated) {
      totalSecs += (firstAt.getTime() - convCreated.getTime()) / 1000;
      responseCount++;
    }
  }
  const avgFirstResponseTime = responseCount > 0 ? Math.round(totalSecs / responseCount) : 0;

  return {
    openConversations,
    totalContacts,
    messagesToday,
    pendingInvitations,
    campaignsSentThisMonth,
    avgFirstResponseTime,
    botConversations,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: `getOverviewMetrics` test PASSES.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(api): extend overview metrics with campaignsSentThisMonth, avgFirstResponseTime, botConversations"
```

---

## Task 3: Add `getMyWork` query function

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getMyWork", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns assigned counts, performance stats and top 3 conversations", async () => {
    const now = new Date();
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([
        {
          id: "conv-1",
          unreadCount: 3,
          lastMessageAt: now,
          createdAt: new Date(now.getTime() - 600_000),
          slaId: null,
          sla: null,
          contact: { name: "Priya Singh", firstName: null, lastName: null },
        },
      ])
      .mockResolvedValueOnce([]); // convs30d
    mockPrisma.contact.count.mockResolvedValue(5);
    mockPrisma.conversation.count.mockResolvedValue(2); // resolvedToday
    mockPrisma.message.findMany
      .mockResolvedValueOnce([{ conversationId: "conv-1", body: "Hello there", contentType: "text", createdAt: now }])  // last messages
      .mockResolvedValueOnce([]); // firstOutbounds

    const { getMyWork } = await import("./analytics-queries.js");
    const result = await getMyWork(mockPrisma as unknown as PrismaClient, "org-1", "user-1");

    expect(result.assignedOpen).toBe(1);
    expect(result.unreadCount).toBe(3);
    expect(result.assignedContacts).toBe(5);
    expect(result.resolvedToday).toBe(2);
    expect(result.avgFirstResponseSecs).toBe(0);
    expect(result.slaBreaches).toBe(0);
    expect(result.topConversations).toHaveLength(1);
    expect(result.topConversations[0]!.contactName).toBe("Priya Singh");
    expect(result.topConversations[0]!.lastMessagePreview).toBe("Hello there");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: FAIL — `getMyWork is not a function`.

- [ ] **Step 3: Add interfaces and `getMyWork` to `apps/api/src/lib/analytics-queries.ts`**

Add after the existing interfaces:

```ts
export interface ConversationPreview {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface MyWorkData {
  assignedOpen: number;
  unreadCount: number;
  assignedContacts: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: ConversationPreview[];
}
```

Add after `getConversationVolume`:

```ts
export async function getMyWork(
  prisma: PrismaClient,
  organizationId: string,
  userId: string
): Promise<MyWorkData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [assignedConvs, assignedContacts, resolvedToday] = await Promise.all([
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: userId, status: { in: ["open", "pending"] } },
      select: {
        id: true,
        unreadCount: true,
        lastMessageAt: true,
        createdAt: true,
        slaId: true,
        sla: { select: { firstResponseSecs: true } },
        contact: { select: { name: true, firstName: true, lastName: true } },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
    prisma.contact.count({ where: { organizationId, assignedUserId: userId } }),
    prisma.conversation.count({
      where: {
        organizationId,
        assignedTo: userId,
        status: "resolved",
        closedAt: { gte: startOfDay },
      },
    }),
  ]);

  const top3Ids = assignedConvs.slice(0, 3).map((c) => c.id);
  const lastMessages = await prisma.message.findMany({
    where: { conversationId: { in: top3Ids }, isSystemMessage: false },
    select: { conversationId: true, body: true, contentType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastMsgByConv = new Map<string, (typeof lastMessages)[0]>();
  for (const m of lastMessages) {
    if (!lastMsgByConv.has(m.conversationId)) lastMsgByConv.set(m.conversationId, m);
  }

  const convs30d = await prisma.conversation.findMany({
    where: { organizationId, assignedTo: userId, createdAt: { gte: since30d } },
    select: { id: true, createdAt: true },
  });
  const firstOutbounds = await prisma.message.findMany({
    where: {
      conversationId: { in: convs30d.map((c) => c.id) },
      direction: "outbound",
      isSystemMessage: false,
    },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstByConv = new Map<string, Date>();
  for (const m of firstOutbounds) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }
  const convCreatedMap = new Map(convs30d.map((c) => [c.id, c.createdAt]));
  let totalSecs = 0;
  let responseCount = 0;
  for (const [convId, firstAt] of firstByConv.entries()) {
    const convCreated = convCreatedMap.get(convId);
    if (convCreated) {
      totalSecs += (firstAt.getTime() - convCreated.getTime()) / 1000;
      responseCount++;
    }
  }

  const slaBreaches = assignedConvs.filter(
    (c) => c.sla && c.createdAt.getTime() + c.sla.firstResponseSecs * 1000 < now.getTime()
  ).length;

  const topConversations: ConversationPreview[] = assignedConvs.slice(0, 3).map((c) => {
    const contact = c.contact;
    const contactName =
      contact?.name ??
      [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ??
      "Unknown";
    const lastMsg = lastMsgByConv.get(c.id);
    let preview = "[Media]";
    if (lastMsg?.body) preview = lastMsg.body.slice(0, 60);
    else if (lastMsg?.contentType === "image") preview = "[Image]";
    else if (lastMsg?.contentType === "audio") preview = "[Audio]";
    return {
      id: c.id,
      contactName,
      lastMessagePreview: preview,
      lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
      unreadCount: c.unreadCount,
    };
  });

  return {
    assignedOpen: assignedConvs.length,
    unreadCount: assignedConvs.reduce((sum, c) => sum + c.unreadCount, 0),
    assignedContacts,
    resolvedToday,
    avgFirstResponseSecs: responseCount > 0 ? Math.round(totalSecs / responseCount) : 0,
    slaBreaches,
    topConversations,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(api): add getMyWork analytics query"
```

---

## Task 4: Replace `getTeamPerformance` with `getTeamStats`

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getTeamStats", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns per-agent stats with openConversations, resolvedToday, slaBreaches", async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user-1", fullName: "Anil Kumar" },
      { id: "user-2", fullName: "Priya Mehta" },
    ]);
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([
        { assignedTo: "user-1", slaId: null, sla: null, createdAt: new Date() },
        { assignedTo: "user-1", slaId: null, sla: null, createdAt: new Date() },
      ])                         // open convs
      .mockResolvedValueOnce([
        { assignedTo: "user-1" },
      ])                         // resolvedToday
      .mockResolvedValueOnce([]); // convs30d

    mockPrisma.message.findMany.mockResolvedValue([]); // firstOutbounds

    const { getTeamStats } = await import("./analytics-queries.js");
    const result = await getTeamStats(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result).toHaveLength(2);
    const anil = result.find((r) => r.userId === "user-1");
    expect(anil?.displayName).toBe("Anil Kumar");
    expect(anil?.openConversations).toBe(2);
    expect(anil?.resolvedToday).toBe(1);
    expect(anil?.slaBreaches).toBe(0);
    expect(anil?.avgFirstResponseSecs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: FAIL — `getTeamStats is not a function`.

- [ ] **Step 3: Add `AgentStats` interface and `getTeamStats` to `apps/api/src/lib/analytics-queries.ts`**

Keep `AgentPerformance` and `getTeamPerformance` for now — they will be removed in Task 7 alongside the route update. Just add the new items after the existing exports:

```ts
export interface AgentStats {
  userId: string;
  displayName: string;
  openConversations: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
}

export async function getTeamStats(
  prisma: PrismaClient,
  organizationId: string
): Promise<AgentStats[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, fullName: true },
  });
  const userIds = users.map((u) => u.id);

  const [openConvs, resolvedConvs, convs30d] = await Promise.all([
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: { in: userIds }, status: { in: ["open", "pending"] } },
      select: {
        assignedTo: true,
        createdAt: true,
        slaId: true,
        sla: { select: { firstResponseSecs: true } },
      },
    }),
    prisma.conversation.findMany({
      where: {
        organizationId,
        assignedTo: { in: userIds },
        status: "resolved",
        closedAt: { gte: startOfDay },
      },
      select: { assignedTo: true },
    }),
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: { in: userIds }, createdAt: { gte: since30d } },
      select: { id: true, assignedTo: true, createdAt: true },
    }),
  ]);

  const conv30dIds = convs30d.map((c) => c.id);
  const convAssignMap = new Map(
    convs30d.map((c) => [c.id, { assignedTo: c.assignedTo, createdAt: c.createdAt }])
  );

  const firstOutbounds = await prisma.message.findMany({
    where: { conversationId: { in: conv30dIds }, direction: "outbound", isSystemMessage: false },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstByConv = new Map<string, Date>();
  for (const m of firstOutbounds) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }

  const openCountByUser = new Map<string, number>();
  const slaBreachByUser = new Map<string, number>();
  for (const c of openConvs) {
    const uid = c.assignedTo!;
    openCountByUser.set(uid, (openCountByUser.get(uid) ?? 0) + 1);
    if (c.sla && c.createdAt.getTime() + c.sla.firstResponseSecs * 1000 < now.getTime()) {
      slaBreachByUser.set(uid, (slaBreachByUser.get(uid) ?? 0) + 1);
    }
  }

  const resolvedCountByUser = new Map<string, number>();
  for (const c of resolvedConvs) {
    const uid = c.assignedTo!;
    resolvedCountByUser.set(uid, (resolvedCountByUser.get(uid) ?? 0) + 1);
  }

  const responseTimesByUser = new Map<string, number[]>();
  for (const [convId, firstAt] of firstByConv.entries()) {
    const convData = convAssignMap.get(convId);
    if (!convData?.assignedTo) continue;
    const uid = convData.assignedTo;
    const secs = (firstAt.getTime() - convData.createdAt.getTime()) / 1000;
    if (!responseTimesByUser.has(uid)) responseTimesByUser.set(uid, []);
    responseTimesByUser.get(uid)!.push(secs);
  }

  return users.map((u) => {
    const times = responseTimesByUser.get(u.id) ?? [];
    const avg =
      times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    return {
      userId: u.id,
      displayName: u.fullName,
      openConversations: openCountByUser.get(u.id) ?? 0,
      resolvedToday: resolvedCountByUser.get(u.id) ?? 0,
      avgFirstResponseSecs: avg,
      slaBreaches: slaBreachByUser.get(u.id) ?? 0,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(api): add getTeamStats (per-agent open, resolved, avgResponse, slaBreaches)"
```

---

## Task 5: Add `getCampaignSnapshot` query function

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getCampaignSnapshot", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns last campaign with delivery counts and next scheduled campaign", async () => {
    const sentAt = new Date("2026-05-27T10:00:00Z");
    const scheduledAt = new Date("2026-06-01T09:00:00Z");

    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce({ id: "camp-1", name: "May Offer", sentAt })
      .mockResolvedValueOnce({ id: "camp-2", name: "June Launch", scheduledAt, _count: { recipients: 150 } });

    mockPrisma.campaignRecipient.groupBy.mockResolvedValue([
      { status: "delivered", _count: { _all: 80 } },
      { status: "read", _count: { _all: 40 } },
      { status: "failed", _count: { _all: 5 } },
      { status: "sent", _count: { _all: 25 } },
    ]);

    const { getCampaignSnapshot } = await import("./analytics-queries.js");
    const result = await getCampaignSnapshot(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result.lastCampaign?.id).toBe("camp-1");
    expect(result.lastCampaign?.totalSent).toBe(150);
    expect(result.lastCampaign?.delivered).toBe(120); // delivered + read
    expect(result.lastCampaign?.read).toBe(40);
    expect(result.lastCampaign?.failed).toBe(5);
    expect(result.nextScheduled?.id).toBe("camp-2");
    expect(result.nextScheduled?.recipientCount).toBe(150);
  });

  it("returns nulls when no campaigns exist", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    const { getCampaignSnapshot } = await import("./analytics-queries.js");
    const result = await getCampaignSnapshot(mockPrisma as unknown as PrismaClient, "org-1");
    expect(result.lastCampaign).toBeNull();
    expect(result.nextScheduled).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: FAIL — `getCampaignSnapshot is not a function`.

- [ ] **Step 3: Add interfaces and `getCampaignSnapshot` to `apps/api/src/lib/analytics-queries.ts`**

```ts
export interface CampaignSnapshotData {
  lastCampaign: {
    id: string;
    name: string;
    sentAt: string;
    totalSent: number;
    delivered: number;
    read: number;
    failed: number;
  } | null;
  nextScheduled: {
    id: string;
    name: string;
    scheduledAt: string;
    recipientCount: number;
  } | null;
}

export async function getCampaignSnapshot(
  prisma: PrismaClient,
  organizationId: string
): Promise<CampaignSnapshotData> {
  const now = new Date();

  const [lastCampaign, nextScheduled] = await Promise.all([
    prisma.campaign.findFirst({
      where: { organizationId, status: "completed" },
      orderBy: { sentAt: "desc" },
      select: { id: true, name: true, sentAt: true },
    }),
    prisma.campaign.findFirst({
      where: { organizationId, status: "scheduled", scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, name: true, scheduledAt: true, _count: { select: { recipients: true } } },
    }),
  ]);

  if (!lastCampaign) {
    return { lastCampaign: null, nextScheduled: null };
  }

  const recipientCounts = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: lastCampaign.id },
    _count: { _all: true },
  });

  const countByStatus = new Map(recipientCounts.map((r) => [r.status, r._count._all]));
  const deliveredStatuses = ["delivered", "read", "played"];
  const delivered = deliveredStatuses.reduce((sum, s) => sum + (countByStatus.get(s) ?? 0), 0);
  const read = countByStatus.get("read") ?? 0;
  const failed = countByStatus.get("failed") ?? 0;
  const totalSent = [...countByStatus.values()].reduce((a, b) => a + b, 0);

  return {
    lastCampaign: {
      id: lastCampaign.id,
      name: lastCampaign.name,
      sentAt: lastCampaign.sentAt?.toISOString() ?? "",
      totalSent,
      delivered,
      read,
      failed,
    },
    nextScheduled: nextScheduled
      ? {
          id: nextScheduled.id,
          name: nextScheduled.name,
          scheduledAt: nextScheduled.scheduledAt!.toISOString(),
          recipientCount: nextScheduled._count.recipients,
        }
      : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(api): add getCampaignSnapshot analytics query"
```

---

## Task 6: Add `getActivityFeed` query function

**Files:**
- Modify: `apps/api/src/lib/analytics-queries.ts`
- Modify: `apps/api/src/lib/analytics-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/lib/analytics-queries.test.ts`:

```ts
describe("getActivityFeed", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("merges events from contacts, campaigns, conversations and users, sorted by time desc", async () => {
    const t1 = new Date("2026-05-28T09:00:00Z");
    const t2 = new Date("2026-05-28T08:00:00Z");
    const t3 = new Date("2026-05-28T07:00:00Z");
    const t4 = new Date("2026-05-28T06:00:00Z");

    mockPrisma.contact.findMany.mockResolvedValue([
      { name: "Rahul Sharma", firstName: null, lastName: null, createdAt: t1 },
    ]);
    mockPrisma.campaign.findMany.mockResolvedValue([
      { name: "May Offer", sentAt: t2 },
    ]);
    mockPrisma.conversation.findMany.mockResolvedValue([
      { contact: { name: "Priya Mehta", firstName: null }, closedAt: t3 },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { fullName: "Sandeep Joshi", createdAt: t4 },
    ]);

    const { getActivityFeed } = await import("./analytics-queries.js");
    const result = await getActivityFeed(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result).toHaveLength(4);
    expect(result[0]!.type).toBe("contact_created");
    expect(result[0]!.label).toContain("Rahul Sharma");
    expect(result[1]!.type).toBe("campaign_sent");
    expect(result[2]!.type).toBe("conversation_closed");
    expect(result[3]!.type).toBe("member_joined");
  });

  it("returns empty array when no events", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { getActivityFeed } = await import("./analytics-queries.js");
    const result = await getActivityFeed(mockPrisma as unknown as PrismaClient, "org-1");
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: FAIL — `getActivityFeed is not a function`.

- [ ] **Step 3: Add `ActivityEvent` interface and `getActivityFeed` to `apps/api/src/lib/analytics-queries.ts`**

```ts
export interface ActivityEvent {
  type: "contact_created" | "campaign_sent" | "conversation_closed" | "member_joined";
  label: string;
  timestamp: string;
}

export async function getActivityFeed(
  prisma: PrismaClient,
  organizationId: string
): Promise<ActivityEvent[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [recentContacts, recentCampaigns, recentClosedConvs, recentMembers] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { name: true, firstName: true, lastName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.campaign.findMany({
      where: { organizationId, status: "completed", sentAt: { gte: since } },
      select: { name: true, sentAt: true },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
    prisma.conversation.findMany({
      where: { organizationId, status: "resolved", closedAt: { gte: since } },
      select: { contact: { select: { name: true, firstName: true } }, closedAt: true },
      orderBy: { closedAt: "desc" },
      take: 5,
    }),
    prisma.user.findMany({
      where: { organizationId, createdAt: { gte: since }, isActive: true },
      select: { fullName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const events: ActivityEvent[] = [];

  for (const c of recentContacts) {
    const name = c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ") ?? "Unknown";
    events.push({ type: "contact_created", label: `New contact: ${name}`, timestamp: c.createdAt.toISOString() });
  }
  for (const c of recentCampaigns) {
    events.push({ type: "campaign_sent", label: `Campaign "${c.name}" sent`, timestamp: c.sentAt?.toISOString() ?? "" });
  }
  for (const c of recentClosedConvs) {
    const name = c.contact?.name ?? c.contact?.firstName ?? "Unknown";
    events.push({ type: "conversation_closed", label: `Conversation with ${name} resolved`, timestamp: c.closedAt?.toISOString() ?? "" });
  }
  for (const u of recentMembers) {
    events.push({ type: "member_joined", label: `${u.fullName} joined the team`, timestamp: u.createdAt.toISOString() });
  }

  return events
    .filter((e) => e.timestamp)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose analytics-queries.test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/lib/analytics-queries.test.ts
git commit -m "feat(api): add getActivityFeed analytics query"
```

---

## Task 7: Wire new routes in `analytics.ts` and clean up old exports

**Files:**
- Modify: `apps/api/src/routes/analytics.ts`
- Modify: `apps/api/src/lib/analytics-queries.ts`

- [ ] **Step 1: Remove `AgentPerformance` interface and `getTeamPerformance` function from `apps/api/src/lib/analytics-queries.ts`**

Delete the following block from `analytics-queries.ts` (these were the old team performance exports, now replaced by `getTeamStats`):

```ts
// DELETE this interface:
export interface AgentPerformance {
  assignedTo: string;
  conversationsHandled: number;
}

// DELETE this function:
export async function getTeamPerformance(
  prisma: PrismaClient,
  organizationId: string
): Promise<AgentPerformance[]> { ... }
```

- [ ] **Step 2: Replace `apps/api/src/routes/analytics.ts` with the full updated file**

```ts
import type { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamStats,
  getMyWork,
  getCampaignSnapshot,
  getActivityFeed,
} from "../lib/analytics-queries.js";
import { cacheGet, cacheSet, orgKey } from "../lib/cache.js";

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:overview");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const metrics = await getOverviewMetrics(fastify.prisma, organizationId);
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
    const key = orgKey(organizationId, "analytics:team");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const stats = await getTeamStats(fastify.prisma, organizationId);
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
};
```

- [ ] **Step 3: Run type check to confirm no errors**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/analytics.ts apps/api/src/lib/analytics-queries.ts
git commit -m "feat(api): wire my-work, campaign-snapshot, activity-feed routes; remove getTeamPerformance"
```

---

## Task 8: Add `OrgMetricCards` component

**Files:**
- Create: `apps/web/components/analytics/OrgMetricCards.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { JSX } from "react";
import { MetricCard } from "./MetricCard";

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

interface OrgMetricCardsProps {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

export function OrgMetricCards(props: OrgMetricCardsProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <MetricCard label="Open Conversations" value={props.openConversations} />
      <MetricCard label="Total Contacts" value={props.totalContacts} />
      <MetricCard label="Messages Today" value={props.messagesToday} />
      <MetricCard label="Campaigns This Month" value={props.campaignsSentThisMonth} />
      <MetricCard label="Avg First Response" value={formatDuration(props.avgFirstResponseTime)} />
      <MetricCard label="Bot Conversations" value={props.botConversations} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/OrgMetricCards.tsx
git commit -m "feat(web): add OrgMetricCards component (6-metric grid)"
```

---

## Task 9: Add `QuickActions` component

**Files:**
- Create: `apps/web/components/analytics/QuickActions.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { JSX } from "react";
import Link from "next/link";

const ACTIONS = [
  { label: "New Campaign", href: "/campaigns/new", icon: "📢" },
  { label: "Import Contacts", href: "/contacts/import", icon: "👥" },
  { label: "Open Inbox", href: "/inbox", icon: "💬" },
  { label: "New Template", href: "/templates/new", icon: "📝" },
] as const;

export function QuickActions(): JSX.Element {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-sm font-medium text-gray-700"
        >
          <span className="text-base">{action.icon}</span>
          {action.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/QuickActions.tsx
git commit -m "feat(web): add QuickActions component"
```

---

## Task 10: Add `MyWorkSection` component

**Files:**
- Create: `apps/web/components/analytics/MyWorkSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface ConversationPreview {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface MyWorkData {
  assignedOpen: number;
  unreadCount: number;
  assignedContacts: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: ConversationPreview[];
}

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function MyWorkSection(): JSX.Element {
  const [data, setData] = useState<MyWorkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/my-work`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: MyWorkData }).data);
        else setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-gray-400">Could not load data</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-4">
        <Link href="/inbox?filter=assigned" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors">
          <p className="text-xs text-gray-500">My Open Convos</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.assignedOpen}</p>
        </Link>
        <Link href="/inbox?filter=unread" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors">
          <p className="text-xs text-gray-500">Unread Messages</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.unreadCount}</p>
        </Link>
        <Link href="/contacts?filter=assigned" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors">
          <p className="text-xs text-gray-500">My Contacts</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.assignedContacts}</p>
        </Link>
      </div>

      {/* Conversation previews */}
      {data.topConversations.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Assigned Conversations</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {data.topConversations.map((conv) => (
              <Link key={conv.id} href={`/inbox?conversation=${conv.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName}</p>
                  <p className="text-xs text-gray-500 truncate">{conv.lastMessagePreview}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className="text-xs text-gray-400">{relativeTime(conv.lastMessageAt)}</span>
                  {conv.unreadCount > 0 && (
                    <span className="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">No open conversations assigned to you</p>
          <Link href="/inbox" className="mt-2 inline-block text-xs text-blue-600 hover:underline">Go to Inbox</Link>
        </div>
      )}

      {/* My performance */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Performance</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500">Resolved Today</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{data.resolvedToday}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500">Avg First Response</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatDuration(data.avgFirstResponseSecs)}</p>
          </div>
          <div className={`bg-white border rounded-xl p-4 shadow-sm ${data.slaBreaches > 0 ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
            <p className="text-xs text-gray-500">SLA Breaches</p>
            <p className={`mt-1 text-2xl font-bold ${data.slaBreaches > 0 ? "text-red-600" : "text-gray-900"}`}>
              {data.slaBreaches}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/MyWorkSection.tsx
git commit -m "feat(web): add MyWorkSection component (stat chips + conversation previews + performance cards)"
```

---

## Task 11: Add `CampaignSnapshot` component

**Files:**
- Create: `apps/web/components/analytics/CampaignSnapshot.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface LastCampaign {
  id: string;
  name: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface NextScheduled {
  id: string;
  name: string;
  scheduledAt: string;
  recipientCount: number;
}

interface SnapshotData {
  lastCampaign: LastCampaign | null;
  nextScheduled: NextScheduled | null;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function DeliveryBar({ delivered, read, totalSent }: { delivered: number; read: number; totalSent: number }): JSX.Element {
  const deliveredPct = totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0;
  const readPct = totalSent > 0 ? Math.round((read / totalSent) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Delivered {deliveredPct}%</span>
        <span>Read {readPct}%</span>
        <span>Sent {totalSent}</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden relative">
        <div className="h-full bg-blue-300 rounded-full" style={{ width: `${deliveredPct}%` }} />
        <div className="h-full bg-blue-600 rounded-full absolute top-0 left-0" style={{ width: `${readPct}%` }} />
      </div>
    </div>
  );
}

export function CampaignSnapshot(): JSX.Element {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/campaign-snapshot`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: SnapshotData }).data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

  if (loading) return <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Campaign Snapshot</h3>
        <Link href="/campaigns" className="text-xs text-blue-600 hover:underline">View all</Link>
      </div>

      {data?.lastCampaign ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Last Sent</p>
            <p className="text-sm font-medium text-gray-900 truncate">{data.lastCampaign.name}</p>
            <p className="text-xs text-gray-400">{new Date(data.lastCampaign.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
          </div>
          <DeliveryBar
            delivered={data.lastCampaign.delivered}
            read={data.lastCampaign.read}
            totalSent={data.lastCampaign.totalSent}
          />
          {data.lastCampaign.failed > 0 && (
            <p className="text-xs text-red-500">{data.lastCampaign.failed} failed</p>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-400">No campaigns sent yet</p>
          <Link href="/campaigns/new" className="mt-1 inline-block text-xs text-blue-600 hover:underline">Create Campaign</Link>
        </div>
      )}

      {data?.nextScheduled && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-1">Next Scheduled</p>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{data.nextScheduled.name}</p>
              <p className="text-xs text-gray-400">
                {new Date(data.nextScheduled.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <span className="ml-2 shrink-0 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {data.nextScheduled.recipientCount} recipients
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/CampaignSnapshot.tsx
git commit -m "feat(web): add CampaignSnapshot component (delivery bar + next scheduled)"
```

---

## Task 12: Add `TeamLeaderboard` component

**Files:**
- Create: `apps/web/components/analytics/TeamLeaderboard.tsx`

- [ ] **Step 1: Create the component**

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

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function TeamLeaderboard(): JSX.Element {
  const [data, setData] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("resolvedToday");
  const [sortAsc, setSortAsc] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/team`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: AgentStats[] }).data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

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
        <p className="px-5 py-6 text-center text-sm text-gray-400">No activity yet today</p>
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
                <tr key={agent.userId} className="hover:bg-gray-50">
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

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/TeamLeaderboard.tsx
git commit -m "feat(web): add TeamLeaderboard component (replaces TeamTable, sortable 4-column)"
```

---

## Task 13: Add `ActivityFeed` component

**Files:**
- Create: `apps/web/components/analytics/ActivityFeed.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface ActivityEvent {
  type: "contact_created" | "campaign_sent" | "conversation_closed" | "member_joined";
  label: string;
  timestamp: string;
}

const ICONS: Record<ActivityEvent["type"], string> = {
  contact_created: "👤",
  campaign_sent: "📢",
  conversation_closed: "✅",
  member_joined: "🎉",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function ActivityFeed(): JSX.Element | null {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/activity-feed`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setEvents((await res.json() as { data: ActivityEvent[] }).data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

  if (loading) return <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />;
  if (events.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {events.map((event, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-3">
            <span className="text-base shrink-0">{ICONS[event.type]}</span>
            <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{event.label}</p>
            <span className="text-xs text-gray-400 shrink-0">{relativeTime(event.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/analytics/ActivityFeed.tsx
git commit -m "feat(web): add ActivityFeed component"
```

---

## Task 14: Update `dashboard/page.tsx`

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Replace `apps/web/app/(dashboard)/dashboard/page.tsx` with the updated version**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { OrgMetricCards } from "@/components/analytics/OrgMetricCards";
import { ConversationChart } from "@/components/analytics/ConversationChart";
import { CampaignSnapshot } from "@/components/analytics/CampaignSnapshot";
import { TeamLeaderboard } from "@/components/analytics/TeamLeaderboard";
import { ActivityFeed } from "@/components/analytics/ActivityFeed";
import { QuickActions } from "@/components/analytics/QuickActions";
import { MyWorkSection } from "@/components/analytics/MyWorkSection";

interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  pendingInvitations: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

interface UsageGate { current: number; limit: number | null; allowed: boolean; }
interface FeatureSwitch { enabled: boolean; }
interface UsageData {
  plan: string;
  unavailableFeatures: string[];
  gates: {
    contacts: UsageGate;
    campaigns: UsageGate;
    chatbots: UsageGate;
    flows: UsageGate;
    custom_fields: UsageGate;
    team_members: UsageGate;
    ai_chat_bot: FeatureSwitch;
    api_access: FeatureSwitch;
  };
}

interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer";
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getOverview(token: string): Promise<OverviewMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: OverviewMetrics }).data : null;
  } catch { return null; }
}

async function getUsage(token: string): Promise<UsageData | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/billing/usage`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: UsageData }).data : null;
  } catch { return null; }
}

async function getCurrentUser(token: string): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: CurrentUser }).data : null;
  } catch { return null; }
}

async function getWabaConnected(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/onboarding/status`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return false;
    return ((await res.json()) as { wabaConnected: boolean }).wabaConnected;
  } catch { return false; }
}

function greeting(fullName: string): string {
  const hour = new Date().getHours();
  const firstName = fullName.split(" ")[0] ?? fullName;
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

const GATE_LABELS: Record<string, string> = {
  contacts: "Contacts", campaigns: "Campaigns", chatbots: "Bots",
  flows: "Flows", custom_fields: "Custom Fields", team_members: "Team Members",
};

function UsageBar({ current, limit, allowed }: UsageGate): JSX.Element {
  const pct = limit != null && limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const barColor = !allowed ? "bg-red-500" : pct >= 80 ? "bg-yellow-400" : "bg-blue-500";
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${limit == null ? 0 : pct}%` }} />
    </div>
  );
}

function PlanUsageWidget({ usage }: { usage: UsageData }): JSX.Element {
  const gateKeys = ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const;
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Plan Usage</h2>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full capitalize">{usage.plan}</span>
      </div>
      {usage.unavailableFeatures.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Limit reached: {usage.unavailableFeatures.map((f) => GATE_LABELS[f] ?? f).join(", ")}.{" "}
          <a href="/settings/billing" className="underline font-medium">Upgrade plan</a>
        </div>
      )}
      <div className="space-y-3">
        {gateKeys.map((key) => {
          const gate = usage.gates[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{GATE_LABELS[key]}</span>
                <span className={`tabular-nums font-medium ${!gate.allowed ? "text-red-600" : "text-gray-500"}`}>
                  {gate.current} / {gate.limit == null ? "Unlimited" : String(gate.limit)}
                </span>
              </div>
              <UsageBar {...gate} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 pt-1">
        {(["ai_chat_bot", "api_access"] as const).map((key) => {
          const on = usage.gates[key].enabled;
          return (
            <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${on ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
              {key === "ai_chat_bot" ? "AI Bot" : "API Access"}: {on ? "On" : "Off"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";

  const [overview, usage, currentUser, wabaConnected] = await Promise.all([
    getOverview(token),
    getUsage(token),
    getCurrentUser(token),
    getWabaConnected(token),
  ]);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.role === "superAdmin";
  const greetingText = greeting(currentUser?.fullName ?? "there");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{greetingText}</h1>
        <a
          href="/settings/whatsapp-account"
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
            wabaConnected
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${wabaConnected ? "bg-green-500" : "bg-amber-400"}`} />
          {wabaConnected ? "WhatsApp Connected" : "WhatsApp Disconnected"}
        </a>
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* My Work */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-4">My Work</h2>
        <MyWorkSection />
      </section>

      {/* Org Overview — admin/manager only */}
      {isAdmin && (
        <section className="space-y-6">
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Org Overview</h2>
          </div>

          {overview && (
            <OrgMetricCards
              openConversations={overview.openConversations}
              totalContacts={overview.totalContacts}
              messagesToday={overview.messagesToday}
              campaignsSentThisMonth={overview.campaignsSentThisMonth}
              avgFirstResponseTime={overview.avgFirstResponseTime}
              botConversations={overview.botConversations}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ConversationChart />
            <CampaignSnapshot />
            {usage && <PlanUsageWidget usage={usage} />}
          </div>

          <TeamLeaderboard />

          <ActivityFeed />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No TypeScript errors.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests pass (except the pre-existing `analytics.test.ts` ECONNRESET timeout which was broken before this feature).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/page.tsx
git commit -m "feat(web): overhaul dashboard — role-adaptive layout with My Work, Quick Actions, and Org Overview"
```

---

## Task 15: Final integration check

- [ ] **Step 1: Start the API and web dev servers**

```bash
pnpm --filter @WBMSG/api dev
# in a second terminal:
pnpm --filter @WBMSG/web dev
```

- [ ] **Step 2: Navigate to `http://localhost:3000/dashboard` and verify**

Check as admin/manager role:
- [ ] Greeting shows first name + time-of-day
- [ ] WhatsApp status pill appears (green or amber)
- [ ] Quick Actions: 4 buttons visible and links are correct
- [ ] My Work section loads: stat chips show numbers, conversation previews appear (or empty state)
- [ ] My Performance cards: Resolved Today, Avg First Response, SLA Breaches
- [ ] Org Overview section visible
- [ ] 6 metric cards render with values
- [ ] Conversation chart renders
- [ ] Campaign Snapshot card renders (or "no campaigns" state)
- [ ] Team Leaderboard renders with column sort on click
- [ ] Activity Feed renders (or hidden if no events)
- [ ] Plan Usage widget renders

Check as agent role (change role in DB or use a test agent account):
- [ ] Greeting, Quick Actions, My Work visible
- [ ] Org Overview section NOT visible

- [ ] **Step 3: Final commit if any minor fixes were needed**

```bash
git add -A
git commit -m "fix(web): dashboard overhaul minor adjustments from manual testing"
```
