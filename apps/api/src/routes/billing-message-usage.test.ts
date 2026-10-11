import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const findMany = vi.fn();
const findSetting = vi.fn();
const findAlerts = vi.fn();
const mockPrisma = { messageUsageDaily: { findMany }, billingSetting: { findUnique: findSetting }, billingAlertEvent: { findMany: findAlerts } };

async function buildAs(role: string, permissions: Record<string, string> = {}, organizationId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId, role: role as never, permissions, teamId: null, teamRole: null };
  });
  const { billingMessageUsageRouter } = await import("./billing-message-usage.js");
  await app.register(billingMessageUsageRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/billing/message-usage", () => {
  beforeEach(() => {
    vi.resetModules();
    findMany.mockReset().mockResolvedValue([]);
    findSetting.mockReset().mockResolvedValue(null);
    findAlerts.mockReset().mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns 403 for a role without settings_billing, before any query", async () => {
    const app = await buildAs("agent");
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    expect(res.statusCode).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows a non-admin who holds the settings_billing sub permission", async () => {
    const app = await buildAs("manager", { settings_access: "allow", "settings_access@settings_billing": "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("rejects an invalid month, including array and empty values", async () => {
    const app = await buildAs("admin");
    for (const q of ["month=2026-13", "month=abc", "month=", "month=2026-10&month=2026-09"]) {
      const res = await app.inject({ method: "GET", url: `/v1/billing/message-usage?${q}` });
      expect(res.statusCode, q).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_MONTH");
    }
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("scopes the query to the caller's organization and the UTC month, defaulting to this month", async () => {
    const app = await buildAs("admin", {}, "org-7");
    await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-7", day: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") } },
      select: { day: true, billableCount: true, bySource: true, computedAt: true },
      orderBy: { day: "asc" },
    });
    await app.close();
  });

  it("returns totals, sources and a daily series", async () => {
    findMany.mockResolvedValue([
      { day: new Date("2026-10-02T00:00:00.000Z"), billableCount: 5, bySource: { campaign: 3, unknown: 2 }, computedAt: new Date("2026-10-10T11:05:00Z") },
    ]);
    const app = await buildAs("admin");
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage?month=2026-10" });
    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { month: string; billable: number; bySource: Record<string, number>; daily: Array<{ day: string; billable: number }>; updatedAt: string } }>().data;
    expect(data.month).toBe("2026-10");
    expect(data.billable).toBe(5);
    expect(data.bySource).toEqual({ campaign: 3, unknown: 2 });
    expect(data.daily).toHaveLength(10);
    expect(data.daily[1]).toEqual({ day: "2026-10-02", billable: 5 });
    expect(data.updatedAt).toBe("2026-10-10T11:05:00.000Z");
    await app.close();
  });

  it("returns an empty summary for an organization with no rows", async () => {
    const app = await buildAs("admin");
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    const data = res.json<{ data: { billable: number; updatedAt: string | null } }>().data;
    expect(data.billable).toBe(0);
    expect(data.updatedAt).toBeNull();
    await app.close();
  });
  it("hides prices, bands and the bill until the owner publishes them", async () => {
    findMany.mockResolvedValue([{ day: new Date("2026-10-05T00:00:00Z"), billableCount: 3240, bySource: {}, computedAt: new Date() }]);
    const app = await buildAs("admin");
    const body = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { plan: unknown; expected: unknown } }>().data;
    expect(body.plan).toEqual({ published: false, freeAllowance: 500 });
    expect(body.expected).toBeNull();
    await app.close();
  });

  it("includes the band, bill and projection once published", async () => {
    findSetting.mockResolvedValue({ value: { published: true, freeAllowance: 500, bands: [{ upTo: 10000, inr: 999, usd: 12 }] } });
    findMany.mockResolvedValue([{ day: new Date("2026-10-05T00:00:00Z"), billableCount: 2000, bySource: {}, computedAt: new Date() }]);
    const app = await buildAs("admin");
    const body = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { plan: { published: boolean; current: { inr: number } }; expected: { band: { inr: number } } } }>().data;
    expect(body.plan.published).toBe(true);
    expect(body.plan.current.inr).toBe(999);
    expect(body.expected.band.inr).toBe(999);
    await app.close();
  });
  it("returns this month's alerts, dropping band alerts while prices are unpublished", async () => {
    findAlerts.mockResolvedValue([
      { kind: "free_50", createdAt: new Date("2026-10-04T10:00:00Z") },
      { kind: "band_1", createdAt: new Date("2026-10-08T10:00:00Z") },
    ]);
    const app = await buildAs("admin");
    const body = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { alerts: Array<{ kind: string }> } }>().data;
    expect(body.alerts.map((a) => a.kind)).toEqual(["free_50"]);
    expect(findAlerts.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", month: "2026-10" });
    await app.close();
  });

  it("still returns usage when the alerts table cannot be read", async () => {
    findAlerts.mockRejectedValue(new Error("no table"));
    const app = await buildAs("admin");
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { alerts: unknown[] } }>().data.alerts).toEqual([]);
    await app.close();
  });
});
