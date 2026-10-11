import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = { billingSetting: { findUnique: vi.fn(), upsert: vi.fn() } };

async function buildAs(role: "superAdmin" | "admin"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null } as never;
  });
  const { adminBillingSettingsRouter } = await import("./admin-billing-settings.js");
  await app.register(adminBillingSettingsRouter, { prefix: "/v1" });
  return app;
}

const valid = { published: true, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, gstRatePercent: 0, seller: { legalName: "Conveys Information Technology", address: "", gstin: "" }, bands: [{ upTo: 10000, inr: 999, usd: 12 }] };

describe("admin billing settings", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    mockPrisma.billingSetting.findUnique.mockReset().mockResolvedValue(null);
    mockPrisma.billingSetting.upsert.mockReset().mockResolvedValue({});
  });
  afterEach(async () => { await app.close(); });

  it("is super-admin only", async () => {
    app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/settings" })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/settings", payload: valid })).statusCode).toBe(403);
    expect(mockPrisma.billingSetting.upsert).not.toHaveBeenCalled();
  });
  it("returns the unpublished draft when nothing is stored", async () => {
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/settings" });
    expect(res.json<{ data: { published: boolean; freeAllowance: number } }>().data).toMatchObject({ published: false, freeAllowance: 500 });
  });
  it("falls back to the unpublished draft when the stored value is invalid", async () => {
    mockPrisma.billingSetting.findUnique.mockResolvedValue({ value: { published: true, freeAllowance: -5, bands: [] } });
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/settings" });
    expect(res.json<{ data: { published: boolean } }>().data.published).toBe(false);
  });
  it("rejects an invalid config and saves a valid one with the editor's id", async () => {
    app = await buildAs("superAdmin");
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/settings", payload: { ...valid, bands: [] } })).statusCode).toBe(400);
    expect(mockPrisma.billingSetting.upsert).not.toHaveBeenCalled();
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/settings", payload: valid })).statusCode).toBe(200);
    expect(mockPrisma.billingSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { key: "config", value: valid, updatedBy: "u-1" } }));
    expect(mockPrisma.billingSetting.upsert.mock.calls[0]![0].update.updatedAt).toBeInstanceOf(Date);
  });
});
