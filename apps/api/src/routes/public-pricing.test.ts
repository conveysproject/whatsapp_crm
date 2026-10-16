import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const findSetting = vi.fn();
const mockPrisma = { billingSetting: { findUnique: findSetting } };

const LIVE = {
  published: true, freeAllowance: 500, alertsEnabled: true, chargingStartDate: "2026-10-12", gstRatePercent: 18,
  seller: { name: "Secret Seller Pvt Ltd", gstin: "27ABCDE1234F1Z5" }, autoIssueEnabled: true, blockingMode: "enforce",
  bands: [{ upTo: 10000, inr: 500, usd: 5 }, { upTo: 50000, inr: 700, usd: 7 }, { upTo: 250000, inr: 1200, usd: 12 }],
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { publicPricingRouter } = await import("./public-pricing.js");
  await app.register(publicPricingRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/public/pricing", () => {
  beforeEach(() => { vi.resetModules(); findSetting.mockReset(); });

  it("is marked public so the auth plugin lets anonymous visitors through", async () => {
    findSetting.mockResolvedValue({ value: LIVE });
    const app = await build();
    let config: unknown;
    app.addHook("preHandler", async (r) => { config = r.routeOptions.config; });
    const res = await app.inject({ method: "GET", url: "/v1/public/pricing" });
    expect(res.statusCode).toBe(200);
    expect(config).toMatchObject({ public: true });
    await app.close();
  });

  it("returns the free allowance and the band table once prices are published", async () => {
    findSetting.mockResolvedValue({ value: LIVE });
    const app = await build();
    const body = (await app.inject({ method: "GET", url: "/v1/public/pricing" })).json<{ data: unknown }>();
    expect(body.data).toEqual({
      published: true,
      freeAllowance: 500,
      bands: [
        { name: "Free", from: 0, to: 500, inr: 0, usd: 0 },
        { name: "Band 1", from: 501, to: 10000, inr: 500, usd: 5 },
        { name: "Band 2", from: 10001, to: 50000, inr: 700, usd: 7 },
        { name: "Band 3 (cap)", from: 50001, to: null, inr: 1200, usd: 12 },
      ],
    });
    await app.close();
  });

  it("never exposes the seller, GST, blocking or charging settings", async () => {
    findSetting.mockResolvedValue({ value: LIVE });
    const app = await build();
    const raw = (await app.inject({ method: "GET", url: "/v1/public/pricing" })).body;
    for (const leak of ["Secret Seller", "27ABCDE", "gstRatePercent", "blockingMode", "chargingStartDate", "autoIssueEnabled", "alertsEnabled"]) {
      expect(raw).not.toContain(leak);
    }
    await app.close();
  });

  it("returns no prices while the owner has not published them", async () => {
    findSetting.mockResolvedValue({ value: { ...LIVE, published: false } });
    const app = await build();
    const body = (await app.inject({ method: "GET", url: "/v1/public/pricing" })).json<{ data: unknown }>();
    expect(body.data).toEqual({ published: false, freeAllowance: 500 });
    await app.close();
  });

  it("falls back to no prices when the stored config is missing or broken", async () => {
    findSetting.mockResolvedValue({ value: { published: "yes" } });
    const app = await build();
    const body = (await app.inject({ method: "GET", url: "/v1/public/pricing" })).json<{ data: { published: boolean } }>();
    expect(body.data.published).toBe(false);
    expect(body.data).not.toHaveProperty("bands");
    await app.close();
  });
});
