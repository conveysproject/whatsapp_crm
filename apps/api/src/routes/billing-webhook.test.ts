import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as ActivationModule from "../lib/billing/activation.js";

const { constructEvent, subsList, activatePlanMock, notifyMock } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subsList: vi.fn(),
  activatePlanMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({ webhooks: { constructEvent }, subscriptions: { list: subsList } }),
  PLAN_PRICE_IDS: { starter: "price_s", growth: "price_g", scale: "price_sc", enterprise: "" },
  PLAN_LIMITS: {},
  ZERO_DECIMAL_CURRENCIES: new Set<string>(),
}));
vi.mock("../lib/billing/activation.js", async (orig) => ({
  ...(await orig<typeof ActivationModule>()),
  activatePlan: activatePlanMock,
}));
vi.mock("../lib/billing/payment-failed-email.js", () => ({ notifyPaymentFailed: notifyMock }));

const mockPrisma = {
  organization: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { billingWebhookRouter } = await import("./billing-webhook.js");
  await app.register(billingWebhookRouter, { prefix: "/v1" });
  return app;
}

const post = (app: FastifyInstance, withSig = true) =>
  app.inject({
    method: "POST",
    url: "/v1/billing/webhook",
    headers: { "content-type": "application/json", ...(withSig ? { "stripe-signature": "sig" } : {}) },
    payload: "{}",
  });

const ev = (type: string, object: Record<string, unknown>) => ({ type, data: { object } });
const invoiceEv = () => ev("invoice.payment_succeeded", { id: "in_1", customer: "cus_1", amount_paid: 299900, currency: "inr" });
const org = (billingStatus = "active") => ({ id: "org-1", planTier: "starter", billingStatus });

let saved: { secret?: string; flag?: string };
let app: FastifyInstance;

beforeEach(async () => {
  saved = { secret: process.env["STRIPE_WEBHOOK_SECRET"], flag: process.env["BILLING_V2_ENABLED"] };
  process.env["STRIPE_WEBHOOK_SECRET"] = "whsec";
  process.env["BILLING_V2_ENABLED"] = "true";
  for (const m of [constructEvent, subsList, activatePlanMock, notifyMock,
    mockPrisma.organization.findFirst, mockPrisma.organization.findUnique,
    mockPrisma.organization.update, mockPrisma.organization.updateMany]) m.mockReset();
  activatePlanMock.mockResolvedValue({ duplicate: false });
  notifyMock.mockResolvedValue(undefined);
  subsList.mockResolvedValue({ data: [] });
  mockPrisma.organization.findFirst.mockResolvedValue(org());
  mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
  app = await build();
});
afterEach(async () => {
  vi.useRealTimers();
  await app.close();
  if (saved.secret === undefined) delete process.env["STRIPE_WEBHOOK_SECRET"]; else process.env["STRIPE_WEBHOOK_SECRET"] = saved.secret;
  if (saved.flag === undefined) delete process.env["BILLING_V2_ENABLED"]; else process.env["BILLING_V2_ENABLED"] = saved.flag;
});

describe("POST /v1/billing/webhook", () => {
  it("400s on a bad signature and does nothing", async () => {
    constructEvent.mockImplementation(() => { throw new Error("bad"); });
    expect((await post(app)).statusCode).toBe(400);
    expect(activatePlanMock).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("400s when constructEvent rejects a missing signature header", async () => {
    constructEvent.mockImplementation(() => { throw new Error("no sig"); });
    expect((await post(app, false)).statusCode).toBe(400);
    expect(activatePlanMock).not.toHaveBeenCalled();
  });

  it("activates the plan on invoice.payment_succeeded", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    subsList.mockResolvedValue({ data: [{ id: "sub_1", cancel_at_period_end: false, items: { data: [{ price: { id: "price_g" } }] } }] });
    expect((await post(app)).statusCode).toBe(200);
    expect(activatePlanMock).toHaveBeenCalledWith(mockPrisma, expect.objectContaining({
      organizationId: "org-1", planTier: "growth", source: "stripe", gateway: "stripe",
      referenceId: "stripe:invoice:in_1", gatewayTransactionId: "in_1",
      amountMinor: 299900, currency: "inr", stripeSubscriptionId: "sub_1",
    }));
  });

  it("keeps the current tier for an unknown price", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    subsList.mockResolvedValue({ data: [{ id: "sub_1", items: { data: [{ price: { id: "price_other" } }] } }] });
    await post(app);
    expect(activatePlanMock).toHaveBeenCalledWith(mockPrisma, expect.objectContaining({ planTier: "starter" }));
  });

  it("200s for an unknown customer without activating", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    expect((await post(app)).statusCode).toBe(200);
    expect(activatePlanMock).not.toHaveBeenCalled();
  });

  it("200s on a duplicate delivery", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    activatePlanMock.mockResolvedValue({ duplicate: true });
    expect((await post(app)).statusCode).toBe(200);
  });

  it("invoice.payment_failed starts grace atomically and emails once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    constructEvent.mockReturnValue(ev("invoice.payment_failed", { id: "in_2", customer: "cus_1" }));
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 });
    expect((await post(app)).statusCode).toBe(200);
    const grace = new Date("2026-10-08T00:00:00Z");
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-1", billingStatus: { not: "past_due" } },
      data: { billingStatus: "past_due", billingGraceEndsAt: grace },
    });
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(mockPrisma, "org-1", grace);
  });

  it("invoice.payment_failed does not email when already past_due (count 0)", async () => {
    constructEvent.mockReturnValue(ev("invoice.payment_failed", { id: "in_2", customer: "cus_1" }));
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    expect((await post(app)).statusCode).toBe(200);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("cancelled org + no active sub: late invoice is ledger-only", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    mockPrisma.organization.findFirst.mockResolvedValue(org("cancelled"));
    expect((await post(app)).statusCode).toBe(200);
    expect(activatePlanMock).toHaveBeenCalledWith(mockPrisma, expect.objectContaining({
      ledgerOnly: true, referenceId: "stripe:invoice:in_1", amountMinor: 299900, currency: "inr" }));
  });

  it("cancelled org + active sub (re-subscribed): normal activation", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    mockPrisma.organization.findFirst.mockResolvedValue(org("cancelled"));
    subsList.mockResolvedValue({ data: [{ id: "sub_9", items: { data: [{ price: { id: "price_g" } }] } }] });
    await post(app);
    const input = activatePlanMock.mock.calls[0]![1] as { ledgerOnly?: boolean; planTier: string };
    expect(input.ledgerOnly).toBeUndefined();
    expect(input.planTier).toBe("growth");
  });

  it("active/past_due org + no active sub: normal activation", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    for (const st of ["active", "past_due"]) {
      activatePlanMock.mockClear();
      mockPrisma.organization.findFirst.mockResolvedValue(org(st));
      await post(app);
      expect((activatePlanMock.mock.calls[0]![1] as { ledgerOnly?: boolean }).ledgerOnly).toBeUndefined();
    }
  });

  it("customer.subscription.updated stores cancel_at_period_end", async () => {
    constructEvent.mockReturnValue(ev("customer.subscription.updated", { id: "sub_1", customer: "cus_1", cancel_at_period_end: true }));
    expect((await post(app)).statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({ where: { id: "org-1" }, data: { planCancelAtPeriodEnd: true } });
  });

  it("customer.subscription.deleted downgrades when no other active sub", async () => {
    constructEvent.mockReturnValue(ev("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" }));
    expect((await post(app)).statusCode).toBe(200);
    expect(subsList).toHaveBeenCalledWith({ customer: "cus_1", status: "active", limit: 1 });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false },
    });
  });

  it("customer.subscription.deleted skips when another sub is active", async () => {
    constructEvent.mockReturnValue(ev("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" }));
    subsList.mockResolvedValue({ data: [{ id: "sub_2" }] });
    expect((await post(app)).statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("checkout.session.completed (flag on) only stores stripeId", async () => {
    constructEvent.mockReturnValue(ev("checkout.session.completed", { customer: "cus_1", metadata: { organizationId: "org-1", planTier: "growth" } }));
    expect((await post(app)).statusCode).toBe(200);
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({ where: { id: "org-1", stripeId: null }, data: { stripeId: "cus_1" } });
    expect(activatePlanMock).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("flag off: legacy checkout behaviour, other events ignored", async () => {
    delete process.env["BILLING_V2_ENABLED"];
    constructEvent.mockReturnValue(ev("checkout.session.completed", { customer: "cus_1", metadata: { organizationId: "org-1", planTier: "growth" } }));
    expect((await post(app)).statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { planTier: "growth", settings: { stripeCustomerId: "cus_1" } },
    });
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled();
    mockPrisma.organization.update.mockClear();
    constructEvent.mockReturnValue(ev("invoice.payment_failed", { id: "in_2", customer: "cus_1" }));
    expect((await post(app)).statusCode).toBe(200);
    constructEvent.mockReturnValue(invoiceEv());
    expect((await post(app)).statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(activatePlanMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("unknown-org errors 200, other errors 500", async () => {
    constructEvent.mockReturnValue(invoiceEv());
    activatePlanMock.mockRejectedValue({ code: "P2003" });
    expect((await post(app)).statusCode).toBe(200);
    activatePlanMock.mockReset().mockRejectedValue(new Error("x"));
    expect((await post(app)).statusCode).toBe(500);
  });

  it("ignores unknown event types", async () => {
    constructEvent.mockReturnValue(ev("charge.refunded", {}));
    expect((await post(app)).statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});
