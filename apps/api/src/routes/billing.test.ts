import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/stripe.js", () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
  PLAN_PRICE_IDS: { starter: "price_starter", growth: "price_growth" },
  PLAN_LIMITS: {
    starter: { contacts: 500, messages: 1000 },
    growth: { contacts: 5000, messages: 20000 },
  },
}));

const mockPrisma = {
  organization: { findUnique: vi.fn(), update: vi.fn() },
  contact: { count: vi.fn() },
  message: { count: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { billingRouter } = await import("./billing.js");
  await app.register(billingRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/billing/usage", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns usage and limits", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ planTier: "starter" });
    mockPrisma.contact.count.mockResolvedValue(100);
    mockPrisma.message.count.mockResolvedValue(300);

    const res = await app.inject({ method: "GET", url: "/v1/billing/usage" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { plan: string; usage: { contacts: number } } }>();
    expect(body.data.plan).toBe("starter");
    expect(body.data.usage.contacts).toBe(100);
  });
});
