import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const findMany = vi.fn();
const findSetting = vi.fn();
const findAlerts = vi.fn();
const findStatements = vi.fn();
const findOrg = vi.fn();
const countFailed = vi.fn();
const mockPrisma = { messageUsageDaily: { findMany }, billingSetting: { findUnique: findSetting }, billingAlertEvent: { findMany: findAlerts }, billingStatement: { findMany: findStatements }, organization: { findUnique: findOrg }, message: { count: countFailed } };

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
    countFailed.mockReset().mockResolvedValue(0);
    findStatements.mockReset().mockResolvedValue([]);
    // Registered 14 March: billing cycles run from the 14th to the 13th.
    findOrg.mockReset().mockResolvedValue({ createdAt: new Date("2026-03-14T09:00:00Z") });
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

  it("rejects an invalid cycle, including array and empty values", async () => {
    const app = await buildAs("admin");
    for (const q of ["cycle=2026-13-01", "cycle=abc", "cycle=", "cycle=2026-02-30", "cycle=2026-10-01&cycle=2026-10-02"]) {
      const res = await app.inject({ method: "GET", url: `/v1/billing/message-usage?${q}` });
      expect(res.statusCode, q).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_CYCLE");
    }
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("scopes the query to the caller's organization and its own billing cycle, defaulting to the current one", async () => {
    const app = await buildAs("admin", {}, "org-7");
    await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    expect(findOrg).toHaveBeenCalledWith({ where: { id: "org-7" }, select: { createdAt: true, settings: true } });
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-7", day: { gte: new Date("2026-09-14T00:00:00.000Z"), lt: new Date("2026-10-14T00:00:00.000Z") } },
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
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage" });
    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { month: string; billable: number; bySource: Record<string, number>; daily: Array<{ day: string; billable: number }>; updatedAt: string } }>().data;
    expect(data.month).toBe("2026-09-14");
    expect(data.billable).toBe(5);
    expect(data.bySource).toEqual({ campaign: 3, unknown: 2 });
    expect(data.daily).toHaveLength(27);
    expect(data.daily.find((d) => d.day === "2026-10-02")).toEqual({ day: "2026-10-02", billable: 5 });
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
    expect(findAlerts.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", month: "2026-09-14" });
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
  it("lists only issued statements of the caller's own organization", async () => {
    findStatements.mockResolvedValue([{ month: "2026-09", messages: 3000, bandName: "Band 1", amountInr: 999, amountUsd: 12, status: "issued" }]);
    const app = await buildAs("admin");
    const body = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { statements: unknown[] } }>().data;
    expect(body.statements).toHaveLength(1);
    expect(findStatements.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", status: { in: ["issued", "no_payment", "paid"] } });
    await app.close();
  });
  it("returns 404 when the organization does not exist and queries no usage", async () => {
    findOrg.mockResolvedValue(null);
    const app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).statusCode).toBe(404);
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns an earlier cycle on request and describes the cycle", async () => {
    const app = await buildAs("admin");
    const res = await app.inject({ method: "GET", url: "/v1/billing/message-usage?cycle=2026-08-14" });
    const data = res.json<{ data: { cycle: { key: string; from: string; toExclusive: string; days: number } } }>().data;
    expect(data.cycle).toEqual({ key: "2026-08-14", from: "2026-08-14T00:00:00.000Z", toExclusive: "2026-09-14T00:00:00.000Z", days: 31 });
    await app.close();
  });
  it("hides in-app alerts the organization switched off", async () => {
    findOrg.mockResolvedValue({ createdAt: new Date("2026-03-14T09:00:00Z"), settings: { billingAlerts: { step50: false, step80: true, step95: true, step100: true, newBand: true, email: true, inApp: true } } });
    findAlerts.mockResolvedValue([
      { kind: "free_50", createdAt: new Date("2026-10-04T10:00:00Z") },
      { kind: "free_80", createdAt: new Date("2026-10-06T10:00:00Z") },
    ]);
    const app = await buildAs("admin");
    const body = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { alerts: Array<{ kind: string }> } }>().data;
    expect(body.alerts.map((a) => a.kind)).toEqual(["free_80"]);
    findOrg.mockResolvedValue({ createdAt: new Date("2026-03-14T09:00:00Z"), settings: { billingAlerts: { step50: true, step80: true, step95: true, step100: true, newBand: true, email: true, inApp: false } } });
    expect((await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { alerts: unknown[] } }>().data.alerts).toEqual([]);
    await app.close();
  });
  it("reports failed sends of this cycle for the callers organization, and survives a count error", async () => {
    countFailed.mockResolvedValue(37);
    const app = await buildAs("admin", {}, "org-7");
    const body = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { failed: number } }>().data;
    expect(body.failed).toBe(37);
    expect(countFailed.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-7", direction: "outbound", status: "failed", isSystemMessage: false });
    countFailed.mockRejectedValue(new Error("db"));
    expect((await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { failed: number } }>().data.failed).toBe(0);
    await app.close();
  });
  it("shows the payment date and reference only on a paid statement", async () => {
    findStatements.mockResolvedValue([
      { month: "2026-09-14", messages: 5, bandName: "Band 1", amountInr: 500, amountUsd: 5, status: "paid", dueAt: null, paymentUrl: "https://rzp.io/l/x", currency: "INR", amountMinor: 50000, taxMinor: null, paidAt: new Date("2026-10-12T06:49:45Z"), paidRef: "pay_Abc123" },
      { month: "2026-10-14", messages: 5, bandName: "Band 1", amountInr: 500, amountUsd: 5, status: "issued", dueAt: new Date("2026-10-21T00:00:00Z"), paymentUrl: "https://rzp.io/l/y", currency: "INR", amountMinor: 50000, taxMinor: null, paidAt: new Date("2026-10-12T06:49:45Z"), paidRef: "pay_leak" },
    ]);
    const app = await buildAs("admin");
    const rows = (await app.inject({ method: "GET", url: "/v1/billing/message-usage" })).json<{ data: { statements: Array<{ status: string; paidAt: string | null; paidRef: string | null; paymentUrl: string | null }> } }>().data.statements;
    expect(rows[0]).toMatchObject({ status: "paid", paidAt: "2026-10-12T06:49:45.000Z", paidRef: "pay_Abc123", paymentUrl: null });
    expect(rows[1]).toMatchObject({ status: "issued", paidAt: null, paidRef: null, paymentUrl: "https://rzp.io/l/y" });
    await app.close();
  });
});
