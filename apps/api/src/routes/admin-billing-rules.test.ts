import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = { billingCountRule: { findMany: vi.fn(), upsert: vi.fn() } };

async function buildAs(role: "superAdmin" | "admin"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null } as never;
  });
  const { adminBillingRulesRouter } = await import("./admin-billing-rules.js");
  await app.register(adminBillingRulesRouter, { prefix: "/v1" });
  return app;
}

describe("admin billing count rules", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    mockPrisma.billingCountRule.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.billingCountRule.upsert.mockReset().mockResolvedValue({ category: "utility", mode: "never", updatedAt: new Date() });
  });
  afterEach(async () => { await app.close(); });

  it("rejects non-super-admins on GET and PUT", async () => {
    app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/count-rules" })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/count-rules", payload: { category: "utility", mode: "never" } })).statusCode).toBe(403);
    expect(mockPrisma.billingCountRule.upsert).not.toHaveBeenCalled();
  });
  it("lists rules for a super admin", async () => {
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing/count-rules" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { modes: string[] } }>().data.modes).toEqual(["follow", "never", "always"]);
  });
  it("validates category and mode", async () => {
    app = await buildAs("superAdmin");
    for (const body of [{ category: "Bad Cat", mode: "never" }, { category: "", mode: "never" }, { category: "utility", mode: "nope" }, {}]) {
      expect((await app.inject({ method: "PUT", url: "/v1/admin/billing/count-rules", payload: body })).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(mockPrisma.billingCountRule.upsert).not.toHaveBeenCalled();
  });
  it("upserts a valid rule and records who changed it", async () => {
    app = await buildAs("superAdmin");
    const res = await app.inject({ method: "PUT", url: "/v1/admin/billing/count-rules", payload: { category: "utility", mode: "never" } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.billingCountRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: "utility" }, create: { category: "utility", mode: "never", updatedBy: "u-1" } }),
    );
  });
});
