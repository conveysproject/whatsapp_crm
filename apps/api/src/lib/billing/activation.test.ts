import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { activatePlan, isUnknownOrgError } from "./activation.js";

const tx = {
  transaction: { create: vi.fn() },
  organization: { update: vi.fn() },
  manualSubscription: { updateMany: vi.fn(), update: vi.fn() },
};
const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) } as unknown as PrismaClient;
const base = { organizationId: "org-1", planTier: "growth" as const, source: "razorpay" as const, gateway: "razorpay" as const, referenceId: "razorpay:pay_1", gatewayTransactionId: "pay_1", amountMinor: 299900, currency: "inr" };
const p2002 = Object.assign(new Error("unique"), { code: "P2002" });

describe("activatePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.transaction.create.mockReset(); tx.organization.update.mockReset();
    tx.manualSubscription.updateMany.mockReset(); tx.manualSubscription.update.mockReset();
  });

  it("records the transaction first, then updates the org and clears billing state", async () => {
    const order: string[] = [];
    tx.transaction.create.mockImplementation(async () => { order.push("txn"); });
    tx.organization.update.mockImplementation(async () => { order.push("org"); });
    const res = await activatePlan(prisma, base);
    expect(res).toEqual({ duplicate: false });
    expect(order).toEqual(["txn", "org"]);
    expect(tx.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId: "org-1", amount: 299900, currency: "INR", type: "subscription", status: "completed",
      gateway: "razorpay", gatewayTransactionId: "pay_1", referenceId: "razorpay:pay_1" }) });
    expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: "org-1" },
      data: { planTier: "growth", billingStatus: "active", billingGraceEndsAt: null, planCancelAtPeriodEnd: false } });
  });

  it("is a no-op duplicate when the transaction keys already exist", async () => {
    tx.transaction.create.mockRejectedValue(p2002);
    const res = await activatePlan(prisma, base);
    expect(res).toEqual({ duplicate: true });
    expect(tx.organization.update).not.toHaveBeenCalled();
  });

  it("rethrows non-unique errors", async () => {
    tx.transaction.create.mockRejectedValue(new Error("db down"));
    await expect(activatePlan(prisma, base)).rejects.toThrow("db down");
  });

  it("activates a manual subscription and cancels the org's other active ones", async () => {
    await activatePlan(prisma, { ...base, source: "manual_approval", gateway: "other", referenceId: "manual:ms-1", gatewayTransactionId: undefined, manualSubscriptionId: "ms-1" });
    expect(tx.manualSubscription.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", status: "active", id: { not: "ms-1" } }, data: { status: "cancelled" } });
    expect(tx.manualSubscription.update).toHaveBeenCalledWith({ where: { id: "ms-1" }, data: { status: "active" } });
  });

  it("passes cancelAtPeriodEnd through", async () => {
    await activatePlan(prisma, { ...base, cancelAtPeriodEnd: true });
    expect(tx.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planCancelAtPeriodEnd: true }) }));
  });
});

describe("activatePlan ledgerOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.transaction.create.mockReset(); tx.organization.update.mockReset();
    tx.manualSubscription.updateMany.mockReset(); tx.manualSubscription.update.mockReset();
  });

  it("inserts the transaction and writes nothing else", async () => {
    const res = await activatePlan(prisma, { ...base, ledgerOnly: true, manualSubscriptionId: "ms-1" });
    expect(res).toEqual({ duplicate: false });
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(tx.organization.update).not.toHaveBeenCalled();
    expect(tx.manualSubscription.updateMany).not.toHaveBeenCalled();
    expect(tx.manualSubscription.update).not.toHaveBeenCalled();
  });

  it("still reports duplicate on P2002", async () => {
    tx.transaction.create.mockRejectedValue(p2002);
    expect(await activatePlan(prisma, { ...base, ledgerOnly: true })).toEqual({ duplicate: true });
  });
});

describe("isUnknownOrgError", () => {
  it("matches P2003 and P2025 only", () => {
    expect(isUnknownOrgError({ code: "P2003" })).toBe(true);
    expect(isUnknownOrgError({ code: "P2025" })).toBe(true);
    expect(isUnknownOrgError({ code: "P2002" })).toBe(false);
    expect(isUnknownOrgError(new Error("x"))).toBe(false);
    expect(isUnknownOrgError(null)).toBe(false);
  });
});
