import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type * as PaymentLinksModule from "./payment-links.js";

const { createLink, sendMail } = vi.hoisted(() => ({ createLink: vi.fn(), sendMail: vi.fn() }));
vi.mock("./payment-links.js", async (orig) => ({
  ...(await orig<typeof PaymentLinksModule>()),
  createStatementPaymentLink: createLink,
}));
vi.mock("../mail.js", () => ({ sendMail }));

import { ensurePaymentLinks, sendPaymentReminders, markStatementPaid, sendPaymentReceived, REMINDER_OFFSETS_DAYS } from "./statement-payment.js";

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
  const settingFindUnique = vi.fn();
  const prisma = {
    billingStatement: { findMany: stFindMany, updateMany },
    organization: { findUnique: orgFindUnique },
    user: { findMany: userFindMany },
    billingSetting: { findUnique: settingFindUnique },
  } as unknown as PrismaClient;
  const st = { id: "s1", organizationId: "o1", month: "2026-10-14", messages: 3240, bandName: "Band 1", amountInr: 500, amountUsd: 5 };

  beforeEach(() => {
    [stFindMany, updateMany, orgFindUnique, userFindMany, createLink, sendMail, settingFindUnique].forEach((m) => m.mockReset());
    settingFindUnique.mockResolvedValue(null);
    stFindMany.mockResolvedValue([st]);
    updateMany.mockResolvedValue({ count: 1 });
    userFindMany.mockResolvedValue([{ email: "a@x.com" }]);
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/abc", ref: "plink_1" });
  });

  it("creates an INR link for an organization located in India, sets a 7-day due date, stores the link and emails admins", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Pune, India", settings: {} });
    expect(await ensurePaymentLinks(prisma, now)).toBe(1);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ statementId: "s1", currency: "INR", amountMinor: 50000, customerEmail: "a@x.com" }));
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: "issued", paymentUrl: null },
      data: expect.objectContaining({ currency: "INR", amountMinor: 50000, dueAt: new Date(now.getTime() + 7 * DAY), paymentUrl: "https://rzp.io/l/abc", paymentProvider: "razorpay", paymentRef: "plink_1" }),
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: expect.stringContaining("₹500.00") });
  });
  it("adds GST to an INR statement when the owner has set a rate, and stores the tax", async () => {
    settingFindUnique.mockResolvedValue({ value: { published: true, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, gstRatePercent: 18, bands: [{ upTo: 10000, inr: 500, usd: 5 }] } });
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Pune, India", settings: {} });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "INR", amountMinor: 59000 }));
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({ amountMinor: 59000, taxMinor: 9000 });
  });
  it("never adds GST to a USD statement", async () => {
    settingFindUnique.mockResolvedValue({ value: { published: true, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, gstRatePercent: 18, bands: [{ upTo: 10000, inr: 500, usd: 5 }] } });
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Dubai", settings: {} });
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/usd", ref: "plink_usd" });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD", amountMinor: 500 }));
    expect(updateMany.mock.calls[0]![0].data.taxMinor).toBeNull();
  });
  it("bills in USD when the connected WhatsApp number is not Indian, even if the location says India", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Pune, India", settings: {}, vendorSettings: [{ value: "+971 50 123 4567" }] });
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/usd", ref: "plink_usd" });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD" }));
    expect(orgFindUnique.mock.calls[0]![0].select.vendorSettings).toEqual({ where: { key: "current_phone_number_number" }, select: { value: true }, take: 1 });
  });
  it("emails the billing email instead of the admins when one is set", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Pune, India", settings: { billing: { billingEmail: "accounts@acme.in" } } });
    await ensurePaymentLinks(prisma, now);
    expect(sendMail.mock.calls[0]![0].to).toEqual(["accounts@acme.in"]);
  });
  it("an explicit billing currency set by the owner beats the WhatsApp number and the location", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Pune, India", settings: { billingCurrency: "USD" } });
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/usd", ref: "plink_usd" });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD" }));
  });
  it("uses USD for a non-Indian or unknown location", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", location: "Dubai", settings: {} });
    createLink.mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/usd", ref: "plink_usd" });
    await ensurePaymentLinks(prisma, now);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD", amountMinor: 500 }));
  });
  it("leaves a statement without a link (to be retried) when the gateway fails, and sends nothing", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme", vendorSettings: [{ value: "+91 98765 43210" }] });
    createLink.mockRejectedValue(new Error("Razorpay is not configured"));
    expect(await ensurePaymentLinks(prisma, now)).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("skips a zero amount and a vanished organization", async () => {
    orgFindUnique.mockResolvedValueOnce(null);
    expect(await ensurePaymentLinks(prisma, now)).toBe(0);
    stFindMany.mockResolvedValue([{ ...st, amountInr: 0, amountUsd: 0 }]);
    orgFindUnique.mockResolvedValue({ name: "Acme", vendorSettings: [{ value: "+91 98765 43210" }] });
    expect(await ensurePaymentLinks(prisma, now)).toBe(0);
    expect(createLink).not.toHaveBeenCalled();
  });
  it("only looks at issued statements without a link", async () => {
    orgFindUnique.mockResolvedValue({ name: "Acme" });
    await ensurePaymentLinks(prisma, now);
    expect(stFindMany.mock.calls[0]![0].where).toEqual({ status: "issued", paymentUrl: null });
  });
});

describe("sendPaymentReminders", () => {
  const stFindMany = vi.fn();
  const updateMany = vi.fn();
  const userFindMany = vi.fn();
  const orgFindUnique = vi.fn();
  const prisma = { billingStatement: { findMany: stFindMany, updateMany }, user: { findMany: userFindMany }, organization: { findUnique: orgFindUnique } } as unknown as PrismaClient;
  const due = new Date("2026-11-01T00:00:00Z");
  const base = { id: "s1", organizationId: "o1", month: "2026-10-14", currency: "INR", amountMinor: 50000, dueAt: due, paymentUrl: "https://rzp.io/l/abc", remindersSent: 0 };

  beforeEach(() => {
    [stFindMany, updateMany, userFindMany, sendMail, orgFindUnique].forEach((m) => m.mockReset());
    updateMany.mockResolvedValue({ count: 1 });
    userFindMany.mockResolvedValue([{ email: "a@x.com" }]);
    orgFindUnique.mockResolvedValue({ settings: {} });
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
  it("sends the reminder to the billing email when the organization has set one", async () => {
    stFindMany.mockResolvedValue([base]);
    orgFindUnique.mockResolvedValue({ settings: { billing: { billingEmail: "accounts@acme.in" } } });
    await sendPaymentReminders(prisma, new Date(due.getTime() + 4 * DAY));
    expect(sendMail.mock.calls[0]![0].to).toEqual(["accounts@acme.in"]);
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

describe("payment received: reference and confirmation email", () => {
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const orgFindUnique = vi.fn();
  const userFindMany = vi.fn();
  const prisma = {
    billingStatement: { findUnique, updateMany },
    organization: { findUnique: orgFindUnique },
    user: { findMany: userFindMany },
  } as unknown as PrismaClient;
  const issued = { status: "issued", currency: "INR", amountMinor: 1000, paymentProvider: "razorpay", paymentRef: "plink_1" };
  const ok = { statementId: "s1", provider: "razorpay" as const, linkRef: "plink_1", currency: "INR", amountMinor: 1000 };
  const full = { organizationId: "o1", month: "2026-10-12", bandName: "Free", messages: 3, currency: "INR", amountMinor: 1000, paidRef: "pay_Abc123" };

  beforeEach(() => {
    [findUnique, updateMany, orgFindUnique, userFindMany, sendMail].forEach((m) => m.mockReset());
    updateMany.mockResolvedValue({ count: 1 });
    orgFindUnique.mockResolvedValue({ settings: {} });
    userFindMany.mockResolvedValue([{ email: "a@x.com" }]);
    // first read is the validation read, the second is the email's read (after the update)
    findUnique.mockResolvedValueOnce(issued).mockResolvedValue(full);
  });

  it("keeps the gateway payment id on the statement and emails the billing contact", async () => {
    expect(await markStatementPaid(prisma, { ...ok, paymentId: "pay_Abc123" }, now)).toBe("paid");
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({ status: "paid", paidAt: now, paidRef: "pay_Abc123" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: expect.stringContaining("payment received") });
    expect(sendMail.mock.calls[0]![0].html).toContain("pay_Abc123");
  });
  it("stores nothing for a malformed or missing payment id and still marks the statement paid", async () => {
    for (const paymentId of ["bad id!", "x".repeat(65), "", undefined]) {
      findUnique.mockReset().mockResolvedValueOnce(issued).mockResolvedValue(full);
      updateMany.mockClear();
      expect(await markStatementPaid(prisma, { ...ok, paymentId }, now), String(paymentId)).toBe("paid");
      expect(updateMany.mock.calls[0]![0].data.paidRef, String(paymentId)).toBeNull();
    }
  });
  it("sends no email when another webhook already settled the statement", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await markStatementPaid(prisma, { ...ok, paymentId: "pay_Abc123" }, now)).toBe("already_paid");
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("still reports paid when the confirmation email fails", async () => {
    sendMail.mockRejectedValue(new Error("mail down"));
    expect(await markStatementPaid(prisma, { ...ok, paymentId: "pay_Abc123" }, now)).toBe("paid");
  });
  it("sends the receipt to the billing email when one is set, and nothing when there is nobody to send to", async () => {
    findUnique.mockReset().mockResolvedValue(full);
    orgFindUnique.mockResolvedValue({ settings: { billing: { billingEmail: "accounts@acme.in" } } });
    expect(await sendPaymentReceived(prisma, "s1")).toBe(true);
    expect(sendMail.mock.calls[0]![0].to).toEqual(["accounts@acme.in"]);
    sendMail.mockClear();
    orgFindUnique.mockResolvedValue({ settings: {} });
    userFindMany.mockResolvedValue([]);
    expect(await sendPaymentReceived(prisma, "s1")).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
    findUnique.mockResolvedValue({ ...full, amountMinor: null });
    expect(await sendPaymentReceived(prisma, "s1")).toBe(false);
  });
});
