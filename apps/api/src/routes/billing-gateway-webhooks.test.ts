import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: vi.fn() } },
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
  default: vi.fn().mockImplementation(() => ({ orders: { create: vi.fn() } })),
}));

const mockPrisma = {
  organization: { findUnique: vi.fn().mockResolvedValue({ settings: {} }), update: vi.fn() },
  vendorSetting: { findMany: vi.fn().mockResolvedValue([]) },
  manualSubscription: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { billingGatewayWebhooksRouter } = await import("./billing-gateway-webhooks.js");
  await app.register(billingGatewayWebhooksRouter, { prefix: "/v1" });
  return app;
}
const rzpBody = (amount: number, currency = "INR", planId = "starter") => JSON.stringify({
  event: "payment.captured",
  payload: { payment: { entity: { amount, currency, notes: { organizationId: "org-1", planId } } } },
});
const sign = (algo: "sha256" | "sha512", secret: string, raw: string) => createHmac(algo, secret).update(raw).digest("hex");

function setEnv(name: string, value: string): () => void {
  const prev = process.env[name];
  process.env[name] = value;
  return () => { if (prev === undefined) delete process.env[name]; else process.env[name] = prev; };
}

describe("razorpay webhook", () => {
  let app: FastifyInstance;
  let restore: () => void;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); mockPrisma.vendorSetting.findMany.mockResolvedValue([]); restore = setEnv("RAZORPAY_WEBHOOK_SECRET", "rzp_secret"); app = await build(); });
  afterEach(async () => { await app.close(); restore(); });

  it("rejects a missing signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json" }, payload: rzpBody(99900) });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("rejects a bad signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": "deadbeef" }, payload: rzpBody(99900) });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("activates the plan for a correct signature and sufficient amount", async () => {
    const raw = rzpBody(99900);
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-1" }, data: expect.objectContaining({ planTier: "starter" }) }));
  });
  it("verifies on raw bytes even when whitespace differs from JSON.stringify", async () => {
    const raw = rzpBody(99900).replace(/,/g, ", ");
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
  });
  it("does NOT activate an underpaid order (returns 200)", async () => {
    const raw = rzpBody(100, "INR", "scale");
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("looks up a manual subscription only within the org from the signed payload", async () => {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { amount: 1, currency: "INR", notes: { organizationId: "org-1", manualSubId: "sub-9" } } } },
    });
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.manualSubscription.findFirst).toHaveBeenCalledWith({ where: { id: "sub-9", organizationId: "org-1" } });
  });
  it("ignores a tenant-set webhook secret and never reads vendor settings", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([{ key: "razorpay_webhook_secret", value: "tenant_known" }]);
    const raw = rzpBody(99900);
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "tenant_known", raw) }, payload: raw });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(mockPrisma.vendorSetting.findMany).not.toHaveBeenCalled();
  });
  it("does not read vendor settings before/after a valid verification either", async () => {
    const raw = rzpBody(99900);
    await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(mockPrisma.vendorSetting.findMany).not.toHaveBeenCalled();
  });
  it("rejects when the env secret is unset", async () => {
    delete process.env["RAZORPAY_WEBHOOK_SECRET"];
    const raw = rzpBody(99900);
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "", raw) }, payload: raw });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});

describe("paystack webhook", () => {
  let app: FastifyInstance;
  let restore: () => void;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); mockPrisma.vendorSetting.findMany.mockResolvedValue([]); restore = setEnv("PAYSTACK_SECRET_KEY", "ps_secret"); app = await build(); });
  afterEach(async () => { await app.close(); restore(); });
  const body = (amount: number, currency: string) => JSON.stringify({ event: "charge.success", data: { amount, currency, metadata: { organizationId: "org-1", planId: "growth" } } });

  it("rejects a bad signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": "nope" }, payload: body(299900, "INR") });
    expect(res.statusCode).toBe(400);
  });
  it("activates the plan for a valid signature and sufficient amount", async () => {
    const raw = body(299900, "INR");
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": sign("sha512", "ps_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({ where: { id: "org-1" }, data: { planTier: "growth" } });
  });
  it("ignores a tenant-set secret key and never reads vendor settings", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([{ key: "paystack_secret_key", value: "tenant_known" }]);
    const raw = body(299900, "INR");
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": sign("sha512", "tenant_known", raw) }, payload: raw });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(mockPrisma.vendorSetting.findMany).not.toHaveBeenCalled();
  });
  it("rejects when the env secret is unset", async () => {
    delete process.env["PAYSTACK_SECRET_KEY"];
    const raw = body(299900, "INR");
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": sign("sha512", "", raw) }, payload: raw });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("fails closed for a non-catalogued currency", async () => {
    const raw = body(99999999, "NGN");
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": sign("sha512", "ps_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});

describe("yoomoney webhook", () => {
  let app: FastifyInstance;
  let restores: Array<() => void>;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);
    restores = [setEnv("YOOMONEY_SHOP_ID", "shop"), setEnv("YOOMONEY_SECRET_KEY", "sk")];
    app = await build();
  });
  afterEach(async () => { await app.close(); vi.unstubAllGlobals(); restores.forEach((r) => r()); });
  const hook = JSON.stringify({ event: "payment.succeeded", object: { id: "pay-1", metadata: { organizationId: "org-1", planId: "starter" } } });
  const send = () => app.inject({ method: "POST", url: "/v1/billing/yoomoney/webhook", headers: { "content-type": "application/json" }, payload: hook });
  const gw = (currency: string, value: string) => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "pay-1", status: "succeeded", paid: true, amount: { value, currency }, metadata: { organizationId: "org-1", planId: "starter" } }) });

  it("ignores a forged notification when the gateway does not confirm the payment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const res = await send();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("activates when gateway confirms a paid, sufficient INR payment", async () => {
    vi.stubGlobal("fetch", gw("INR", "999.00"));
    const res = await send();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { planTier: "starter" } }));
  });
  it("does not auto-activate RUB payments (no catalog price)", async () => {
    vi.stubGlobal("fetch", gw("RUB", "99999.00"));
    const res = await send();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("ignores tenant-set gateway credentials and uses only env credentials", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "yoomoney_shop_id", value: "evil-shop" },
      { key: "yoomoney_secret_key", value: "evil-secret" },
    ]);
    const fetchMock = gw("INR", "999.00");
    vi.stubGlobal("fetch", fetchMock);
    await send();
    expect(mockPrisma.vendorSetting.findMany).not.toHaveBeenCalled();
    const headers = (fetchMock.mock.calls[0]![1] as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe(`Basic ${Buffer.from("shop:sk").toString("base64")}`);
  });
  it("does nothing when env credentials are missing", async () => {
    delete process.env["YOOMONEY_SHOP_ID"];
    const fetchMock = gw("INR", "999.00");
    vi.stubGlobal("fetch", fetchMock);
    const res = await send();
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});
