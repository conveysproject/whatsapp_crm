import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const { stripeSessionCreate, ordersCreate, razorpayCtor } = vi.hoisted(() => ({ stripeSessionCreate: vi.fn(), ordersCreate: vi.fn(), razorpayCtor: vi.fn() }));
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
  default: vi.fn().mockImplementation((opts: unknown) => {
    razorpayCtor(opts);
    return { orders: { create: ordersCreate } };
  }),
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
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);
    ordersCreate.mockResolvedValue({ id: "order_test123", amount: 99900, currency: "INR" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("creates an order for the server-side price and ignores the client amount", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/create-order",
      payload: { planId: "starter", amount: 1 } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { orderId: string } }>().data.orderId).toBe("order_test123");
    expect(ordersCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 99900, currency: "INR", notes: { planId: "starter", organizationId: "org-1" },
    }));
  });

  it("uses only platform env keys and never reads tenant gateway credentials", async () => {
    const prevId = process.env["RAZORPAY_KEY_ID"], prevSecret = process.env["RAZORPAY_KEY_SECRET"];
    process.env["RAZORPAY_KEY_ID"] = "env_key_id"; process.env["RAZORPAY_KEY_SECRET"] = "env_key_secret";
    mockPrisma.vendorSetting.findMany.mockResolvedValue([{ key: "razorpay_key_id", value: "tenant_id" }, { key: "razorpay_key_secret", value: "tenant_secret" }]);
    try {
      const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/create-order", payload: { planId: "starter" } });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.vendorSetting.findMany).not.toHaveBeenCalled();
      expect(razorpayCtor).toHaveBeenCalledWith({ key_id: "env_key_id", key_secret: "env_key_secret" });
    } finally {
      if (prevId === undefined) delete process.env["RAZORPAY_KEY_ID"]; else process.env["RAZORPAY_KEY_ID"] = prevId;
      if (prevSecret === undefined) delete process.env["RAZORPAY_KEY_SECRET"]; else process.env["RAZORPAY_KEY_SECRET"] = prevSecret;
    }
  });

  it("rejects unknown and enterprise plans", async () => {
    for (const planId of ["plan-standard", "enterprise", "starter___yearly"]) {
      const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/create-order", payload: { planId } });
      expect(res.statusCode, planId).toBe(400);
    }
    expect(ordersCreate).not.toHaveBeenCalled();
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
    mockPrisma.manualSubscription.findFirst.mockResolvedValueOnce({ id: "ms-1", organizationId: "org-2", planTier: "growth" });
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

describe("POST /v1/billing/yoomoney/checkout", () => {
  async function buildAs(role: string, permissions: Record<string, string>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { billingRouter } = await import("./billing.js");
    await app.register(billingRouter, { prefix: "/v1" });
    return app;
  }
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockPrisma.vendorSetting.findMany.mockResolvedValue([]); });

  it("returns 403 without settings_billing", async () => {
    const app = await buildAs("manager", { settings_access: "allow" });
    const res = await app.inject({ method: "POST", url: "/v1/billing/yoomoney/checkout", payload: { amount: 99900, planId: "starter" } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 400 for a non-billable plan id", async () => {
    const app = await buildAs("admin", {});
    const res = await app.inject({ method: "POST", url: "/v1/billing/yoomoney/checkout", payload: { amount: 99900, planId: "plan-standard" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_PLAN");
    await app.close();
  });
});

describe("billing branding and webhook url", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it("setup-webhook registers the real stripe webhook path", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(new URL("./billing.ts", import.meta.url), "utf8");
    expect(src).toContain("/v1/billing/webhook`");
    expect(src).not.toContain("/v1/billing/stripe/webhook");
  });
  it("has no TrustCRM text left in customer-facing billing strings", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(new URL("./billing.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/TrustCRM/);
  });
});
