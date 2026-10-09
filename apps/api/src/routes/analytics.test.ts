import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  orgKey: (_org: string, key: string) => key,
}));

vi.mock("../lib/dashboard-queries.js", () => ({
  getDashboardKpis: vi.fn(),
  getAttentionCounts: vi.fn(),
  getCampaignFunnel: vi.fn(),
}));
vi.mock("../lib/plan-limits.js", () => ({ checkPlanLimit: vi.fn() }));

const mockPrisma = {
  organization: { findUnique: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  contact: { count: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  invitation: { count: vi.fn() },
  campaign: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  campaignRecipient: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

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

describe("analytics section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { analyticsRouter } = await import("./analytics.js");
    await app.register(analyticsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when the role lacks analytics_access", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // no analytics_access
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.conversation.count).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows the read when the role has analytics_access", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ analytics_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses the section gate even with empty permissions", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("analytics sub gates", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { analyticsRouter } = await import("./analytics.js");
    await app.register(analyticsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("blocks GET /analytics/team when analytics_agent_performance sub is off", async () => {
    const app = await buildAppAs({ analytics_access: "allow" }); // no analytics_agent_performance sub
    const res = await app.inject({ method: "GET", url: "/v1/analytics/team" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows GET /analytics/team when analytics_agent_performance sub is on", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const app = await buildAppAs({
      analytics_access: "allow",
      "analytics_access@analytics_agent_performance": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/analytics/team" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("blocks GET /analytics/export when analytics_export sub is off", async () => {
    const app = await buildAppAs({ analytics_access: "allow" }); // no analytics_export sub
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=overview" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows GET /analytics/export when analytics_export sub is on", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const app = await buildAppAs({
      analytics_access: "allow",
      "analytics_access@analytics_export": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=overview" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses all analytics sub gates", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const teamRes = await app.inject({ method: "GET", url: "/v1/analytics/team" });
    expect(teamRes.statusCode).toBe(200);
    await app.close();
  });
});

describe("GET /v1/analytics/dashboard", () => {
  const KPIS = {
    openConversations: { value: 3 },
    newConversations: { value: 5, previous: 4, deltaPct: 25 },
    newContacts: { value: 1, previous: 0, deltaPct: null },
    messages: { value: 10, previous: 5, deltaPct: 100, inbound: 6, outbound: 4 },
    firstReplySecs: { value: null, previous: null, deltaPct: null },
    campaignsSent: { value: 0, previous: 0, deltaPct: null },
  };
  const FUNNEL = { id: "c1", name: "Promo", sentAt: "2026-10-01T00:00:00.000Z", sent: 10, delivered: 8, read: 4, failed: 1 };

  async function appAs(permissions: Record<string, string>, role: string): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { analyticsRouter } = await import("./analytics.js");
    await app.register(analyticsRouter, { prefix: "/v1" });
    return app;
  }

  async function mocks() {
    const dq = await import("../lib/dashboard-queries.js");
    const pl = await import("../lib/plan-limits.js");
    const cache = await import("../lib/cache.js");
    vi.mocked(dq.getDashboardKpis).mockResolvedValue(KPIS as never);
    vi.mocked(dq.getAttentionCounts).mockResolvedValue({ unanswered: 4, sla_at_risk: 0, failed_messages: 2, templates: 1 });
    vi.mocked(dq.getCampaignFunnel).mockResolvedValue({ current: FUNNEL, previous: null });
    vi.mocked(pl.checkPlanLimit).mockResolvedValue({ allowed: true, limit: -1, current: 1 });
    mockPrisma.organization.findUnique.mockResolvedValue({ wabaAccessToken: "tok" });
    return { dq, pl, cache };
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 400 INVALID_RANGE", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard?range=1y" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_RANGE");
    await app.close();
  });

  it("returns 400 INVALID_TZ", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard?tz=Mars/Base" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TZ");
    await app.close();
  });

  it("treats an empty tz as UTC", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard?tz=" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.tz).toBe("UTC");
    await app.close();
  });

  it("returns 400 INVALID_TZ for a repeated tz param", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard?tz=UTC&tz=Asia/Kolkata" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TZ");
    await app.close();
  });

  it("returns 400 INVALID_RANGE for a repeated range param", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard?range=7d&range=30d" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_RANGE");
    await app.close();
  });

  it("returns 403 without analytics_access", async () => {
    await mocks();
    const app = await appAs({ inbox_access: "allow" }, "agent");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("admin gets the full shape, zero-count items omitted, org-scoped queries", async () => {
    const { dq, pl } = await mocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ wabaAccessToken: null });
    vi.mocked(pl.checkPlanLimit).mockImplementation(async (_p, _o, e) =>
      e === "contacts" ? { allowed: true, limit: 100, current: 85 } : { allowed: true, limit: -1, current: 0 });
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard?range=30d&tz=Asia/Kolkata" });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.range).toBe("30d");
    expect(d.tz).toBe("Asia/Kolkata");
    expect(typeof d.generatedAt).toBe("string");
    expect(d.kpis).toEqual(KPIS);
    expect(d.campaignFunnel).toEqual({ current: FUNNEL, previous: null });
    const keys = d.attention.map((a: { key: string }) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["whatsapp_disconnected", "unanswered", "failed_messages", "templates", "plan_usage"]));
    expect(keys).not.toContain("sla_at_risk");
    for (const a of d.attention) {
      expect(a.count).toBeGreaterThan(0);
      expect(Object.keys(a).sort()).toEqual(["count", "href", "key", "label", "severity"]);
    }
    const wa = d.attention.find((a: { key: string }) => a.key === "whatsapp_disconnected");
    expect(wa).toMatchObject({ severity: "critical", href: "/settings/whatsapp-account" });
    const plan = d.attention.find((a: { key: string }) => a.key === "plan_usage");
    expect(plan).toMatchObject({ severity: "warning", href: "/settings/billing", count: 1 });
    expect(vi.mocked(dq.getDashboardKpis).mock.calls[0]![1]).toBe("org-1");
    expect(vi.mocked(dq.getAttentionCounts).mock.calls[0]![1]).toBe("org-1");
    expect(vi.mocked(dq.getCampaignFunnel).mock.calls[0]![1]).toBe("org-1");
    expect(mockPrisma.organization.findUnique.mock.calls[0]![0].where.id).toBe("org-1");
    expect(vi.mocked(pl.checkPlanLimit).mock.calls[0]![1]).toBe("org-1");
    await app.close();
  });

  it("defaults range 7d and tz UTC", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    expect(res.json().data).toMatchObject({ range: "7d", tz: "UTC" });
    await app.close();
  });

  it("plan item is critical when a gate is not allowed", async () => {
    const { pl } = await mocks();
    vi.mocked(pl.checkPlanLimit).mockImplementation(async (_p, _o, e) =>
      e === "flows" ? { allowed: false, limit: 5, current: 5 } : { allowed: true, limit: -1, current: 0 });
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    const plan = res.json().data.attention.find((a: { key: string }) => a.key === "plan_usage");
    expect(plan.severity).toBe("critical");
    await app.close();
  });

  it("restricted user sees only whatsapp item, no funnel, no plan, no gated queries", async () => {
    const { dq, pl } = await mocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ wabaAccessToken: null });
    const app = await appAs({ analytics_access: "allow" }, "agent");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.attention.map((a: { key: string }) => a.key)).toEqual(["whatsapp_disconnected"]);
    expect(d.campaignFunnel).toBeNull();
    expect(dq.getCampaignFunnel).not.toHaveBeenCalled();
    expect(pl.checkPlanLimit).not.toHaveBeenCalled();
    const want = vi.mocked(dq.getAttentionCounts).mock.calls[0]![3] as Set<string>;
    expect([...want]).toEqual([]);
    await app.close();
  });

  it("area permissions unlock matching items only", async () => {
    const { dq } = await mocks();
    const app = await appAs({ analytics_access: "allow", inbox_access: "allow", campaigns_access: "allow" }, "agent");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    const d = res.json().data;
    const keys = d.attention.map((a: { key: string }) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["unanswered", "failed_messages"]));
    expect(keys).not.toContain("templates");
    expect(keys).not.toContain("plan_usage");
    expect(d.campaignFunnel).not.toBeNull();
    const want = vi.mocked(dq.getAttentionCounts).mock.calls[0]![3] as Set<string>;
    expect([...want].sort()).toEqual(["failed_messages", "sla_at_risk", "unanswered"]);
    await app.close();
  });

  it("cache key differs by range, tz and permission set", async () => {
    const { cache } = await mocks();
    const keys: string[] = [];
    vi.mocked(cache.cacheSet).mockImplementation(async (k: string) => { keys.push(k); });
    for (const [perm, role, qs] of [
      [{}, "admin", "range=7d&tz=UTC"],
      [{}, "admin", "range=30d&tz=UTC"],
      [{}, "admin", "range=7d&tz=Asia/Kolkata"],
      [{ analytics_access: "allow" }, "agent", "range=7d&tz=UTC"],
      [{ analytics_access: "allow", inbox_access: "allow" }, "agent", "range=7d&tz=UTC"],
    ] as const) {
      const app = await appAs(perm as Record<string, string>, role);
      await app.inject({ method: "GET", url: `/v1/analytics/dashboard?${qs}` });
      await app.close();
    }
    expect(new Set(keys).size).toBe(5);
    expect(keys.every((k) => k.startsWith("analytics:dashboard:"))).toBe(true);
  });

  it("serves from cache without querying", async () => {
    const { dq, cache } = await mocks();
    vi.mocked(cache.cacheGet).mockResolvedValueOnce({ cached: true });
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    expect(res.json().data).toEqual({ cached: true });
    expect(dq.getDashboardKpis).not.toHaveBeenCalled();
    await app.close();
  });

  it("response contains no body or phoneNumber fields", async () => {
    await mocks();
    const app = await appAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/analytics/dashboard" });
    expect(res.body).not.toMatch(/"body"|phoneNumber|"phone"/);
    await app.close();
  });
});

describe("analytics days clamp", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  async function keyFor(url: string): Promise<string> {
    vi.resetModules(); vi.clearAllMocks();
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.conversation.groupBy.mockResolvedValue([]);
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    const cache = await import("../lib/cache.js");
    const app = await buildApp();
    await app.inject({ method: "GET", url });
    await app.close();
    return String(vi.mocked(cache.cacheSet).mock.calls[0]?.[0]);
  }

  it("clamps overview days to 1..90 and NaN to 30", async () => {
    expect(await keyFor("/v1/analytics/overview?days=500")).toBe("analytics:overview:90");
    expect(await keyFor("/v1/analytics/overview?days=0")).toBe("analytics:overview:1");
    expect(await keyFor("/v1/analytics/overview?days=abc")).toBe("analytics:overview:30");
  });

  it("clamps conversations, team, campaigns and conversation-status", async () => {
    expect(await keyFor("/v1/analytics/conversations?days=9999")).toBe("analytics:conversations:90");
    expect(await keyFor("/v1/analytics/team?days=9999")).toBe("analytics:team:90");
    expect(await keyFor("/v1/analytics/campaigns?days=-5")).toBe("analytics:campaigns:1");
    expect(await keyFor("/v1/analytics/conversation-status?days=x")).toBe("analytics:conv-status:30");
  });
});
