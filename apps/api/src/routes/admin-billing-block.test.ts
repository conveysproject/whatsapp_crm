import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/prisma.js", () => ({ prisma: {} }));

const mockPrisma = {
  billingStatement: { findMany: vi.fn() },
  organization: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  billingSetting: { findUnique: vi.fn() },
};

async function buildAs(role: "superAdmin" | "admin"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null } as never;
  });
  const { adminBillingBlockRouter } = await import("./admin-billing-block.js");
  await app.register(adminBillingBlockRouter, { prefix: "/v1" });
  return app;
}

const DAY = 86_400_000;

describe("admin billing block routes", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    mockPrisma.billingStatement.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.organization.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.organization.findUnique.mockReset().mockResolvedValue({ settings: { theme: "dark" } });
    mockPrisma.organization.update.mockReset().mockResolvedValue({});
    mockPrisma.billingSetting.findUnique.mockReset().mockResolvedValue({ value: { published: true, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, gstRatePercent: 0, autoIssueEnabled: false, blockingMode: "enforce", bands: [{ upTo: 10000, inr: 500, usd: 5 }] } });
  });
  afterEach(async () => { await app.close(); });

  it("is super-admin only", async () => {
    app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/overdue" })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/org-block", payload: { organizationId: "o1", exempt: true } })).statusCode).toBe(403);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("lists overdue customers with their state; a customer with no payment link is never blocked; paused ones show their pause date", async () => {
    mockPrisma.billingStatement.findMany.mockResolvedValue([
      { organizationId: "blocked", month: "2026-10-14", dueAt: new Date(Date.now() - 10 * DAY), paymentUrl: "https://rzp.io/l/x", amountMinor: 50000, currency: "INR" },
      { organizationId: "nolink", month: "2026-10-14", dueAt: new Date(Date.now() - 30 * DAY), paymentUrl: null, amountMinor: 500, currency: "USD" },
      { organizationId: "paused", month: "2026-10-14", dueAt: new Date(Date.now() - 20 * DAY), paymentUrl: "https://rzp.io/l/y", amountMinor: 50000, currency: "INR" },
    ]);
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: "blocked", name: "Acme", settings: {} },
      { id: "nolink", name: "Foreign Co", settings: {} },
      { id: "paused", name: "Promised Co", settings: { billingBlock: { pauseUntil: "2099-01-01" } } },
    ]);
    app = await buildAs("superAdmin");
    const data = (await app.inject({ method: "GET", url: "/v1/admin/billing/overdue" })).json<{ data: { mode: string; organizations: Array<{ name: string; state: string; pauseUntil: string | null; exempt: boolean; statements: Array<{ hasLink: boolean }> }> } }>().data;
    expect(data.mode).toBe("enforce");
    const by = Object.fromEntries(data.organizations.map((o) => [o.name, o]));
    expect(by["Acme"]!.state).toBe("blocked");
    expect(by["Foreign Co"]!.state).toBe("ok");
    expect(by["Foreign Co"]!.statements[0]!.hasLink).toBe(false);
    expect(by["Promised Co"]!.state).toBe("ok");
    expect(by["Promised Co"]!.pauseUntil).toBe("2099-01-01");
  });

  it("validates an override before writing", async () => {
    app = await buildAs("superAdmin");
    for (const body of [{}, { organizationId: "o1" }, { organizationId: "", exempt: true }, { organizationId: "o1", exempt: "yes" }, { organizationId: "o1", pauseUntil: "soon" }, { organizationId: "o1", pauseUntil: "2026-02-30" }]) {
      expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/org-block", payload: body })).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("saves a pause date and an exemption, keeping other settings and the other half of the override", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: { theme: "dark", billingBlock: { exempt: true, pauseUntil: null } } });
    app = await buildAs("superAdmin");
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/org-block", payload: { organizationId: "o1", pauseUntil: "2026-12-01" } })).statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { settings: { theme: "dark", billingBlock: { exempt: true, pauseUntil: "2026-12-01" } } } });
    await app.inject({ method: "PUT", url: "/v1/admin/billing/org-block", payload: { organizationId: "o1", pauseUntil: null, exempt: false } });
    expect(mockPrisma.organization.update).toHaveBeenLastCalledWith({ where: { id: "o1" }, data: { settings: { theme: "dark", billingBlock: { exempt: false, pauseUntil: null } } } });
  });

  it("returns 404 for an unknown organization", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    app = await buildAs("superAdmin");
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/org-block", payload: { organizationId: "nope", exempt: true } })).statusCode).toBe(404);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});
