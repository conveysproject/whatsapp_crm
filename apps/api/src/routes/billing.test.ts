import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const { stripeSessionCreate } = vi.hoisted(() => ({ stripeSessionCreate: vi.fn() }));
vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: stripeSessionCreate } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
  }),
  PLAN_PRICE_IDS: { starter: "price_starter", growth: "price_growth" },
  PLAN_LIMITS: {
    starter: { contacts: 500, messages: 1000 },
    growth: { contacts: 5000, messages: 20000 },
  },
  ZERO_DECIMAL_CURRENCIES: new Set<string>(),
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
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

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
      payload: { planId: "starter", proofUrl: "https://cdn.example.com/proof.jpg", transactionRef: "TXN123" },
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

describe("settings_billing sub gate", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "manager"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { billingRouter } = await import("./billing.js");
    await app.register(billingRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("blocks POST /billing/cancel when settings_billing sub is off", async () => {
    const app = await buildAppAs({ settings_access: "allow" }); // settings_billing sub off
    const res = await app.inject({ method: "POST", url: "/v1/billing/cancel" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("blocks POST /billing/switch-plan when settings_billing sub is off", async () => {
    const app = await buildAppAs({ settings_access: "allow" }); // settings_billing sub off
    const res = await app.inject({ method: "POST", url: "/v1/billing/switch-plan", payload: { planTier: "pro" } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("admin bypasses settings_billing sub gate", async () => {
    mockPrisma.manualSubscription.findFirst.mockResolvedValue(null);
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "[]" });
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "POST", url: "/v1/billing/cancel" });
    // admin bypasses — response may be 200 or depends on stripe mock; just not 403
    expect(res.statusCode).not.toBe(403);
    await app.close();
  });
});

describe("POST /v1/billing/checkout", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["WEB_PUBLIC_URL"] = "https://wbmsg.com";
    stripeSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("creates a session for allowed redirect urls", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/checkout",
      payload: { planTier: "starter", successUrl: "https://wbmsg.com/settings/billing", cancelUrl: "https://wbmsg.com/settings/billing" } });
    expect(res.statusCode).toBe(200);
  });

  it("rejects redirect urls on other origins", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/checkout",
      payload: { planTier: "starter", successUrl: "https://evil.com/x", cancelUrl: "https://wbmsg.com/settings/billing" } });
    expect(res.statusCode).toBe(400);
    expect(stripeSessionCreate).not.toHaveBeenCalled();
  });

  it("returns 403 without settings_billing", async () => {
    const other = Fastify({ logger: false });
    other.decorate("prisma", mockPrisma as unknown as PrismaClient);
    other.addHook("onRequest", async (r) => { r.auth = { ...mockAuth, role: "agent" as never, permissions: {} }; });
    const { billingRouter } = await import("./billing.js");
    await other.register(billingRouter, { prefix: "/v1" });
    const res = await other.inject({ method: "POST", url: "/v1/billing/checkout",
      payload: { planTier: "starter", successUrl: "https://wbmsg.com/a", cancelUrl: "https://wbmsg.com/a" } });
    expect(res.statusCode).toBe(403);
    await other.close();
  });
});

async function buildAs(role: string, permissions: Record<string, string> = {}): Promise<FastifyInstance> {
  const a = Fastify({ logger: false });
  a.decorate("prisma", mockPrisma as unknown as PrismaClient);
  a.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-9", organizationId: "org-1", role: role as never, permissions, teamId: null, teamRole: null };
  });
  const { billingRouter } = await import("./billing.js");
  await a.register(billingRouter, { prefix: "/v1" });
  return a;
}

describe("manual subscription + read RBAC", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("org admin cannot approve a manual subscription", async () => {
    const a = await buildAs("admin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/ms-1/approve" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.manualSubscription.findFirst).not.toHaveBeenCalled();
    await a.close();
  });

  it("org admin cannot reject a manual subscription", async () => {
    const a = await buildAs("admin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/ms-1/reject" });
    expect(res.statusCode).toBe(403);
    await a.close();
  });

  it("superAdmin can approve", async () => {
    mockPrisma.manualSubscription.findFirst.mockResolvedValue({ id: "ms-1", organizationId: "org-2", planTier: "growth" });
    const a = await buildAs("superAdmin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/ms-1/approve" });
    expect(res.statusCode).toBe(200);
    await a.close();
  });

  it("agent cannot submit proof, cancel request, or read subscriptions/transactions", async () => {
    const a = await buildAs("agent");
    for (const [method, url] of [
      ["POST", "/v1/billing/manual/submit-proof"],
      ["DELETE", "/v1/billing/manual/cancel-request"],
      ["GET", "/v1/billing/subscriptions"],
      ["GET", "/v1/billing/transactions"],
    ] as const) {
      const res = await a.inject({ method, url, payload: method === "POST" ? { planId: "starter", proofUrl: "https://x/y", transactionRef: "T1" } : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    await a.close();
  });

  it("submit-proof rejects unknown plan tiers", async () => {
    const a = await buildAs("admin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/submit-proof",
      payload: { planId: "plan-standard", proofUrl: "https://x/y", transactionRef: "T2" } });
    expect(res.statusCode).toBe(400);
    await a.close();
  });
});
