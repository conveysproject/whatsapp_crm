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

vi.mock("razorpay", () => ({
  default: vi.fn().mockImplementation(() => ({
    orders: {
      create: vi.fn().mockResolvedValue({ id: "order_test123", amount: 99900, currency: "INR" }),
    },
  })),
}));

const mockPrisma = {
  organization: { findUnique: vi.fn(), update: vi.fn() },
  contact: { count: vi.fn().mockResolvedValue(0) },
  message: { count: vi.fn().mockResolvedValue(0) },
  campaign: { count: vi.fn().mockResolvedValue(0) },
  chatbot: { count: vi.fn().mockResolvedValue(0) },
  flow: { count: vi.fn().mockResolvedValue(0) },
  contactCustomField: { count: vi.fn().mockResolvedValue(0) },
  user: { count: vi.fn().mockResolvedValue(0) },
  vendorSetting: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  manualSubscription: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  $transaction: vi.fn().mockResolvedValue([]),
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

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

    const res = await app.inject({ method: "GET", url: "/v1/billing/usage" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { plan: string; gates: { contacts: { current: number } } } }>();
    expect(body.data.plan).toBe("starter");
    expect(body.data.gates.contacts.current).toBe(100);
  });
});

describe("POST /v1/billing/razorpay/create-order", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a Razorpay order and returns order id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/billing/razorpay/create-order",
      payload: { planId: "plan-standard", amount: 99900 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { orderId: string } }>().data.orderId).toBe("order_test123");
  });
});

describe("POST /v1/billing/manual/submit-proof", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a manual subscription record with status pending", async () => {
    mockPrisma.manualSubscription.create.mockResolvedValue({ id: "ms-1", status: "pending" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/billing/manual/submit-proof",
      payload: { planId: "plan-standard", proofUrl: "https://cdn.example.com/proof.jpg", transactionRef: "TXN123" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("GET /v1/billing/upi-qr", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns a PNG image buffer for UPI QR", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/billing/upi-qr?amount=99900&planId=plan-standard",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
  });
});
