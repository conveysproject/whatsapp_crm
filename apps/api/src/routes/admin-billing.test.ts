import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  messageUsageDaily: { findMany: vi.fn() },
  organization: { findMany: vi.fn() },
};

type Role = "superAdmin" | "admin" | "agent";

async function buildAs(role: Role): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null } as never;
  });
  const { adminBillingRouter } = await import("./admin-billing.js");
  await app.register(adminBillingRouter, { prefix: "/v1" });
  return app;
}

const D1 = new Date("2026-03-01T00:00:00Z");
const D2 = new Date("2026-03-02T00:00:00Z");

function fixture() {
  mockPrisma.messageUsageDaily.findMany.mockResolvedValue([
    { organizationId: "o1", day: D1, billableCount: 50, bySource: { api: 30, campaign: 20 } },
    { organizationId: "o1", day: D2, billableCount: 100, bySource: { api: 70, inbox: 30 } },
    { organizationId: "o2", day: D1, billableCount: 2000, bySource: { campaign: 2000 } },
    { organizationId: "o3", day: D2, billableCount: 10, bySource: { api: 10 } },
  ]);
  mockPrisma.organization.findMany.mockResolvedValue([
    { id: "o1", name: "Alpha", planTier: "growth" },
    { id: "o2", name: "Beta", planTier: "pro" },
    { id: "o3", name: "Gamma", planTier: "free" },
  ]);
}

describe("GET /v1/admin/billing/usage", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    vi.resetModules();
    mockPrisma.messageUsageDaily.findMany.mockReset();
    mockPrisma.organization.findMany.mockReset();
  });
  afterEach(async () => { await app.close(); });

  it("(a) rejects non-superAdmin before any query", async () => {
    app = await buildAs("admin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    expect(mockPrisma.messageUsageDaily.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
  });

  it("(b) rejects missing or invalid month", async () => {
    app = await buildAs("superAdmin");
    for (const url of ["/v1/admin/billing/usage", "/v1/admin/billing/usage?month=2026-13", "/v1/admin/billing/usage?month=foo"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_MONTH");
    }
    expect(mockPrisma.messageUsageDaily.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid limit", async () => {
    app = await buildAs("superAdmin");
    for (const l of ["0", "1001", "abc", "1.5"]) {
      const res = await app.inject({ method: "GET", url: `/v1/admin/billing/usage?month=2026-03&limit=${l}` });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_LIMIT");
    }
  });

  it("(c) aggregates, merges bySource, sorts and computes percentiles/buckets", async () => {
    fixture();
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03" });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.month).toBe("2026-03");
    expect(d.from).toBe("2026-03-01T00:00:00.000Z");
    expect(d.toExclusive).toBe("2026-04-01T00:00:00.000Z");
    expect(d.totals).toEqual({ organizations: 3, billable: 2160 });
    expect(d.percentiles).toEqual({ p50: 150, p90: 2000, p99: 2000, max: 2000 });
    expect(d.buckets).toEqual({ "0-99": 1, "100-999": 1, "1k-4.9k": 1 });
    expect(d.organizations.map((o: { organizationId: string }) => o.organizationId)).toEqual(["o2", "o1", "o3"]);
    expect(d.organizations[1]).toEqual({
      organizationId: "o1", name: "Alpha", planTier: "growth", billable: 150,
      bySource: { api: 100, campaign: 20, inbox: 30 },
    });
  });

  it("(d) excludes internal orgs by default and includes with includeInternal=true", async () => {
    mockPrisma.messageUsageDaily.findMany.mockResolvedValue([
      { organizationId: "o1", day: D1, billableCount: 5, bySource: {} },
      { organizationId: "int", day: D1, billableCount: 500, bySource: {} },
    ]);
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: "o1", name: "Alpha", planTier: "free" },
      { id: "int", name: "Conveys Information Technology", planTier: "pro" },
    ]);
    app = await buildAs("superAdmin");
    let res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03" });
    expect(res.json().data.totals).toEqual({ organizations: 1, billable: 5 });
    expect(res.json().data.organizations).toHaveLength(1);
    res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03&includeInternal=true" });
    expect(res.json().data.totals).toEqual({ organizations: 2, billable: 505 });
  });

  it("(e) limit truncates the list but not totals/percentiles", async () => {
    fixture();
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03&limit=1" });
    const d = res.json().data;
    expect(d.organizations).toHaveLength(1);
    expect(d.organizations[0].organizationId).toBe("o2");
    expect(d.totals).toEqual({ organizations: 3, billable: 2160 });
    expect(d.percentiles.p50).toBe(150);
  });

  it("(f) filters on the month's day range", async () => {
    fixture();
    app = await buildAs("superAdmin");
    await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03" });
    const arg = mockPrisma.messageUsageDaily.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ day: { gte: new Date("2026-03-01T00:00:00Z"), lt: new Date("2026-04-01T00:00:00Z") } });
    expect(arg.select).toEqual({ organizationId: true, billableCount: true, bySource: true });
  });

  it("(g) shows a placeholder for deleted organizations", async () => {
    mockPrisma.messageUsageDaily.findMany.mockResolvedValue([
      { organizationId: "gone", day: D1, billableCount: 7, bySource: { api: 7, bad: "x" } },
    ]);
    mockPrisma.organization.findMany.mockResolvedValue([]);
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03" });
    expect(res.json().data.organizations[0]).toEqual({
      organizationId: "gone", name: "(deleted organization)", planTier: "unknown", billable: 7, bySource: { api: 7 },
    });
  });

  it("(h) empty month returns zeros and an empty list", async () => {
    mockPrisma.messageUsageDaily.findMany.mockResolvedValue([]);
    mockPrisma.organization.findMany.mockResolvedValue([]);
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/usage?month=2026-03" });
    const d = res.json().data;
    expect(d.totals).toEqual({ organizations: 0, billable: 0 });
    expect(d.percentiles).toEqual({ p50: 0, p90: 0, p99: 0, max: 0 });
    expect(d.buckets).toEqual({});
    expect(d.organizations).toEqual([]);
  });
});
