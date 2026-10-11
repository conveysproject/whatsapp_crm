import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  billingStatement: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  organization: { findMany: vi.fn() },
  messageUsageDaily: { groupBy: vi.fn() },
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
    mockPrisma.messageUsageDaily.groupBy.mockReset().mockResolvedValue([]);
    mockPrisma.billingSetting.findUnique.mockReset().mockResolvedValue(null);
  });
  afterEach(async () => { await app.close(); });

  it("is super-admin only", async () => {
    app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=2026-10" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { month: "2026-10" } })).statusCode).toBe(403);
    expect(mockPrisma.billingStatement.findMany).not.toHaveBeenCalled();
  });
  it("validates the month", async () => {
    app = await buildAs("superAdmin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=bad" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { month: 5 } })).statusCode).toBe(400);
  });
  it("lists statements with totals and hides our own organizations by default", async () => {
    mockPrisma.billingStatement.findMany.mockResolvedValue([
      { organizationId: "a", messages: 3000, bandName: "Band 1", amountInr: 999, amountUsd: 12, status: "draft" },
      { organizationId: "b", messages: 9000, bandName: "Band 1", amountInr: 999, amountUsd: 12, status: "draft" },
    ]);
    mockPrisma.organization.findMany.mockResolvedValue([{ id: "a", name: "Acme" }, { id: "b", name: "Conveys Information Technology" }]);
    app = await buildAs("superAdmin");
    const body = (await app.inject({ method: "GET", url: "/v1/admin/billing/statements?month=2026-10" })).json<{ data: { totals: { statements: number; inr: number }; statements: Array<{ name: string }> } }>().data;
    expect(body.statements.map((s) => s.name)).toEqual(["Acme"]);
    expect(body.totals).toMatchObject({ statements: 1, inr: 999 });
  });
  it("refuses to prepare an unfinished month", async () => {
    app = await buildAs("superAdmin");
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const res = await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { month } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("MONTH_NOT_FINISHED");
  });
  it("prepares drafts for a finished month", async () => {
    mockPrisma.messageUsageDaily.groupBy.mockResolvedValue([{ organizationId: "a", _sum: { billableCount: 3240 } }]);
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "POST", url: "/v1/admin/billing/statements/generate", payload: { month: "2026-09" } });
    expect(res.json<{ data: { created: number } }>().data.created).toBe(1);
    expect(mockPrisma.billingStatement.create.mock.calls[0]![0].data.status).toBe("draft");
  });
});
