import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type * as PaymentLinksModule from "./payment-links.js";

const { createLink, sendMail } = vi.hoisted(() => ({ createLink: vi.fn(), sendMail: vi.fn() }));
vi.mock("./payment-links.js", async (orig) => ({
  ...(await orig<typeof PaymentLinksModule>()),
  createStatementPaymentLink: createLink,
}));
vi.mock("../mail.js", () => ({ sendMail }));

import { ensurePaymentLinks, sendPaymentReminders, markStatementPaid, REMINDER_OFFSETS_DAYS } from "./statement-payment.js";

const DAY = 86_400_000;
const now = new Date("2026-11-20T10:00:00Z");

describe("markStatementPaid", () => {
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const prisma = { billingStatement: { findUnique, updateMany } } as unknown as PrismaClient;
  const issued = { status: "issued", currency: "INR", amountMinor: 50000, paymentProvider: "razorpay", paymentRef: "plink_1" };
  const ok = { statementId: "s1", provider: "razorpay" as const, linkRef: "plink_1", currency: "INR", amountMinor: 50000 };
  beforeEach(() => { findUnique.mockReset().mockResolvedValue(issued); updateMany.mockReset().mockResolvedValue({ count: 1 }); });

  it("marks an issued statement paid when provider, link, currency and amount all match", async () => {
    expect(await markStatementPaid(prisma, ok, now)).toBe("paid");
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "s1", status: "issued" }, data: expect.objectContaining({ status: "paid", paidAt: now }) });
  });
  it("accepts an overpayment but rejects an underpayment", async () => {
    expect(await markStatementPaid(prisma, { ...ok, amountMinor: 60000 }, now)).toBe("paid");
    updateMany.mockClear();
    expect(await markStatementPaid(prisma, { ...ok, amountMinor: 49999 }, now)).toBe("rejected");
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("rejects another provider, another link, or another currency", async () => {
    for (const bad of [{ linkRef: "plink_other" }, { currency: "USD" }]) {
      expect(await markStatementPaid(prisma, { ...ok, ...bad }, now), JSON.stringify(bad)).toBe("rejected");
    }
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("rejects a statement whose stored link belongs to a different provider", async () => {
    findUnique.mockResolvedValue({ ...issued, paymentProvider: "stripe" });
    expect(await markStatementPaid(prisma, ok, now)).toBe("rejected");
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("never pays a draft, void or unknown statement and is idempotent for a paid one", async () => {
    findUnique.mockResolvedValue({ ...issued, status: "draft" });
    expect(await markStatementPaid(prisma, ok, now)).toBe("rejected");
    findUnique.mockResolvedValue({ ...issued, status: "void" });
    expect(await markStatementPaid(prisma, ok, now)).toBe("rejected");
    findUnique.mockResolvedValue({ ...issued, status: "paid" });
    expect(await markStatementPaid(prisma, ok, now)).toBe("already_paid");
    findUnique.mockResolvedValue(null);
    expect(await markStatementPaid(prisma, ok, now)).toBe("not_found");
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("reports already_paid when a concurrent webhook won the race", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await markStatementPaid(prisma, ok, now)).toBe("already_paid");
  });
});

describe("ensurePaymentLinks", () => {
  const stFindMany = vi.fn();
  const updateMany = vi.fn();
  const orgFindUnique = vi.fn();
  const userFindMany = vi.fn();
  const prisma = {
    billingStatement: { findMany: stFindMany, updateMany },
    organization: { findUnique: orgFindUnique },
    user: { findMany: userFindMany },
  } as unknown as PrismaClient;
  const st = { id: "s1", organizationId: "o1", month: "2026-10-14", messages: 3240, bandName: "Band 1", amountInr: 500, amountUsd: 5 };

  beforeEach(() => {
    [stFindMany, updateMany, orgFindUnique, userFindMany, createLink, sendMail].forEach((m) => m.mockReset());
    stFindMany.mockResolvedValue([st]);
    updateMany.mockResolvedValue({ count: 1 });
    userFindMany.mockResolvedValue([{ email: "a@x.com" }]);
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/abc", ref: "plink_1" });
  });

  it("creates an INR link for an organization located in India, sets a 7-day due date, stores the link and emails admins", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", phone: null, location: "Pune, India", settings: {} });
    expect(await ensurePaymentLinks(prisma, now)).toBe(1);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ statementId: "s1", currency: "INR", amountMinor: 50000, customerEmail: "a@x.com" }));
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: "issued", paymentUrl: null },
      data: expect.objectContaining({ currency: "INR", amountMinor: 50000, dueAt: new Date(now.getTime() + 7 * DAY), paymentUrl: "https://rzp.io/l/abc", paymentProvider: "razorpay", paymentRef: "plink_1" }),
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: expect.stringContaining("₹500.00") });
  });
  it("an explicit billing currency set by the owner beats location and phone", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", phone: null, location: "Pune, India", settings: { billingCurrency: "USD" } });
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/usd", ref: "plink_usd" });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD" }));
  });
  it("uses USD for a non-Indian or unknown location", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", phone: null, location: "Dubai", settings: {} });
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/usd", ref: "plink_usd" });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD", amountMinor: 500 }));
  });
  it("leaves a statement without a link (to be retried) when the gateway fails, and sends nothing", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", phone: "+919876543210" });
    createLink.mockRejectedValue(new Error("Razorpay is not configured"));
    expect(await ensurePaymentLinks(prisma, now)).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("skips a zero amount and a vanished organization", async () => {
    orgFindUnique.mockResolvedValueOnce(null);
    expect(await ensurePaymentLinks(prisma, now)).toBe(0);
    stFindMany.mockResolvedValue([{ ...st, amountInr: 0, amountUsd: 0 }]);
    orgFindUnique.mockResolvedValue({ name: "Acme", phone: "+919876543210" });
    expect(await ensurePaymentLinks(prisma, now)).toBe(0);
    expect(createLink).not.toHaveBeenCalled();
  });
  it("only looks at issued statements without a link", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", phone: null });
    await ensurePaymentLinks(prisma, now);
    expect(stFindMany.mock.calls[0]![0].where).toEqual({ status: "issued", paymentUrl: null });
  });
});

describe("sendPaymentReminders", () => {
  const stFindMany = vi.fn();
  const updateMany = vi.fn();
  const userFindMany = vi.fn();
  const prisma = { billingStatement: { findMany: stFindMany, updateMany }, user: { findMany: userFindMany } } as unknown as PrismaClient;
  const due = new Date("2026-11-01T00:00:00Z");
  const base = { id: "s1", organizationId: "o1", month: "2026-10-14", currency: "INR", amountMinor: 50000, dueAt: due, paymentUrl: "https://rzp.io/l/abc", remindersSent: 0 };

  beforeEach(() => {
    [stFindMany, updateMany, userFindMany, sendMail].forEach((m) => m.mockReset());
    updateMany.mockResolvedValue({ count: 1 });
    userFindMany.mockResolvedValue([{ email: "a@x.com" }]);
  });

  it("uses the 3, 7, 14 day schedule", () => {
    expect([...REMINDER_OFFSETS_DAYS]).toEqual([3, 7, 14]);
  });
  it("sends nothing before 3 days after the due date", async () => {
    stFindMany.mockResolvedValue([base]);
    expect(await sendPaymentReminders(prisma, new Date(due.getTime() + 3 * DAY - 1000))).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("sends the first reminder at 3 days and advances the counter atomically", async () => {
    stFindMany.mockResolvedValue([base]);
    expect(await sendPaymentReminders(prisma, new Date(due.getTime() + 3 * DAY))).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "s1", status: "issued", remindersSent: 0 }, data: { remindersSent: 1 } });
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: expect.stringContaining("overdue") });
  });
  it("sends only one reminder per run even when several are overdue", async () => {
    stFindMany.mockResolvedValue([base]);
    await sendPaymentReminders(prisma, new Date(due.getTime() + 30 * DAY));
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it("does not send when another run already claimed the reminder", async () => {
    stFindMany.mockResolvedValue([base]);
    updateMany.mockResolvedValue({ count: 0 });
    expect(await sendPaymentReminders(prisma, new Date(due.getTime() + 4 * DAY))).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("only queries issued statements that have a link and reminders left", async () => {
    stFindMany.mockResolvedValue([]);
    await sendPaymentReminders(prisma, now);
    expect(stFindMany.mock.calls[0]![0].where).toEqual({ status: "issued", paymentUrl: { not: null }, dueAt: { not: null }, remindersSent: { lt: 3 } });
  });
});
