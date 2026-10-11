import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  billingStatement: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  organization: { findMany: vi.fn() },
  messageUsageDaily: { findMany: vi.fn() },
  billingSetting: { findUnique: vi.fn() },
};

async function buildAs(role: "superAdmin" | "admin"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null } as never;
  });
  const { adminBillingStatementsRouter } = await import("./admin-billing-statements.js");
  await app.register(adminBillingStatementsRouter, { prefix: "/v1" });
  return app;
}

describe("admin billing statements", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    mockPrisma.billingStatement.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.billingStatement.create.mockReset();
    mockPrisma.organization.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.messageUsageDaily.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.billingSetting.findUnique.mockReset().mockResolvedValue(null);
  });
  afterEach(async () => { await app.close(); });

  it("is super-admin only", async () => {
    app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=2026-10" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { date: "2026-11-14" } })).statusCode).toBe(403);
    expect(mockPrisma.billingStatement.findMany).not.toHaveBeenCalled();
  });
  it("validates the month", async () => {
    app = await buildAs("superAdmin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=bad" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { date: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { date: "2026-02-30" } })).statusCode).toBe(400);
  });
  it("lists statements with totals and hides our own organizations by default", async () => {
    mockPrisma.billingStatement.findMany.mockResolvedValue([
      { organizationId: "a", month: "2026-10-14", messages: 3000, bandName: "Band 1", amountInr: 999, amountUsd: 12, status: "draft" },
      { organizationId: "b", month: "2026-10-20", messages: 9000, bandName: "Band 1", amountInr: 999, amountUsd: 12, status: "draft" },
    ]);
    mockPrisma.organization.findMany.mockResolvedValue([{ id: "a", name: "Acme" }, { id: "b", name: "Conveys Information Technology" }]);
    app = await buildAs("superAdmin");
    const body = (await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=2026-10" })).json<{ data: { totals: { statements: number; inr: number }; statements: Array<{ name: string }> } }>().data;
    expect(body.statements.map((s) => s.name)).toEqual(["Acme"]);
    expect(body.totals).toMatchObject({ statements: 1, inr: 999 });
  });
  it("filters the list to cycles that started in the requested calendar month", async () => {
    app = await buildAs("superAdmin");
    await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=2026-10" });
    expect(mockPrisma.billingStatement.findMany.mock.calls[0]![0].where).toEqual({ month: { startsWith: "2026-10-" } });
  });
  it("refuses to prepare a day that has not arrived", async () => {
    app = await buildAs("superAdmin");
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { date: future } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("DATE_NOT_ARRIVED");
  });
  it("prepares drafts for the cycles that ended on a past day", async () => {
    mockPrisma.organization.findMany.mockResolvedValue([{ id: "a", createdAt: new Date("2026-03-14T08:00:00Z") }]);
    mockPrisma.messageUsageDaily.findMany.mockResolvedValue([{ organizationId: "a", day: new Date("2026-09-01T00:00:00Z"), billableCount: 3240 }]);
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { date: "2026-09-14" } });
    expect(res.json<{ data: { created: number } }>().data.created).toBe(1);
    expect(mockPrisma.billingStatement.create.mock.calls[0]![0].data).toMatchObject({ status: "draft", month: "2026-08-14" });
  });
  it("issue and status endpoints are super-admin only", async () => {
    app = await buildAs("admin");
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/issue" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/status", payload: { organizationId: "a", month: "2026-10-14", status: "paid" } })).statusCode).toBe(403);
    expect(mockPrisma.billingStatement.updateMany).not.toHaveBeenCalled();
  });
  it("refuses to issue without a charging start date", async () => {
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "POST", url: "/v1/admin/billing/statements/issue" });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("CHARGING_NOT_CONFIGURED");
  });
  it("validates and applies a status change", async () => {
    mockPrisma.billingStatement.updateMany.mockReset().mockResolvedValue({ count: 1 });
    app = await buildAs("superAdmin");
    for (const body of [{}, { organizationId: "a", month: "2026-10", status: "paid" }, { organizationId: "a", month: "2026-10-14", status: "draft" }]) {
      expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/status", payload: body })).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/status", payload: { organizationId: "a", month: "2026-10-14", status: "paid" } })).statusCode).toBe(200);
    mockPrisma.billingStatement.updateMany.mockResolvedValue({ count: 0 });
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/status", payload: { organizationId: "a", month: "2026-10-14", status: "paid" } })).statusCode).toBe(409);
  });
});
