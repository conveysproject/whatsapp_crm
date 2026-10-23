// Each customer-facing billing/closure site must hand sendBillingMail the RECIPIENT organization's id and the same
// recipient list as before. Owner summaries and the owner cancellation notice must keep using sendMail.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type * as PaymentLinks from "./payment-links.js";
import type * as Statements from "./statements.js";

const { sendMail, sendBillingMail, createLink } = vi.hoisted(() => ({ sendMail: vi.fn(), sendBillingMail: vi.fn(), createLink: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a), isEmailConfigured: () => true }));
vi.mock("./billing-mail.js", () => ({ sendBillingMail: (...a: unknown[]) => sendBillingMail(...a) }));
vi.mock("../redis.js", () => ({ redis: { eval: vi.fn() } }));
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("./payment-links.js", async (orig) => ({
  ...(await orig<typeof PaymentLinks>()),
  createStatementPaymentLink: (...a: unknown[]) => createLink(...a),
}));
vi.mock("./statements.js", async (orig) => ({ ...(await orig<typeof Statements>()), issueStatements: vi.fn() }));
vi.mock("./metering-sweep.js", () => ({ runMeteringSweep: vi.fn().mockResolvedValue({}) }));

import { ensurePaymentLinks, sendPaymentReminders, sendPaymentReceived } from "./statement-payment.js";
import { runBlockingSweep } from "./automation.js";
import { requestCancellation, approveCancellation } from "./cancellation.js";
import { notifyPaymentFailed } from "./payment-failed-email.js";
import { evaluateAlerts } from "./alerts.js";
import { DEFAULT_BILLING_CONFIG } from "./bands.js";

const DAY = 86_400_000;
const now = new Date("2026-11-20T10:00:00Z");
const fn = () => vi.fn();

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue(undefined);
  sendBillingMail.mockReset().mockResolvedValue(undefined);
  createLink.mockReset().mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/abc?x=WBMSG&y=1", ref: "plink_1" });
});

function billing(i = 0): unknown {
  return sendBillingMail.mock.calls[i]![1];
}

describe("site org id: statement-payment emails", () => {
  it("statement email", async () => {
    const prisma = {
      billingStatement: { findMany: fn().mockResolvedValue([{ id: "s1", organizationId: "client-org-9", month: "2026-10-14", messages: 3240, bandName: "Band 1", amountInr: 500, amountUsd: 5 }]), updateMany: fn().mockResolvedValue({ count: 1 }) },
      organization: { findUnique: fn().mockResolvedValue({ name: "Acme", location: "Pune, India", settings: {} }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
      billingSetting: { findUnique: fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    expect(await ensurePaymentLinks(prisma, now)).toBe(1);
    expect(sendBillingMail).toHaveBeenCalledTimes(1);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com"] });
  });
  it("reminder email", async () => {
    const due = new Date("2026-11-01T00:00:00Z");
    const prisma = {
      billingStatement: { findMany: fn().mockResolvedValue([{ id: "s1", organizationId: "client-org-9", month: "2026-10-14", currency: "INR", amountMinor: 50000, dueAt: due, paymentUrl: "https://rzp.io/l/abc", remindersSent: 0 }]), updateMany: fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
      organization: { findUnique: fn().mockResolvedValue({ settings: {} }) },
    } as unknown as PrismaClient;
    await sendPaymentReminders(prisma, new Date(due.getTime() + 4 * DAY));
    expect(sendBillingMail).toHaveBeenCalledTimes(1);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com"] });
  });
  it("payment received email", async () => {
    const prisma = {
      billingStatement: { findUnique: fn().mockResolvedValue({ organizationId: "client-org-9", month: "2026-10-12", bandName: "Free", messages: 3, currency: "INR", amountMinor: 1000, paidRef: "pay_Abc123" }) },
      organization: { findUnique: fn().mockResolvedValue({ settings: {} }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
    } as unknown as PrismaClient;
    expect(await sendPaymentReceived(prisma, "s1")).toBe(true);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com"] });
  });
});

describe("site org id: blocking sweep email", () => {
  it("pause notice", async () => {
    const prisma = {
      billingStatement: { findMany: fn().mockResolvedValue([{ organizationId: "client-org-9", month: "2026-10-14" }]) },
      organization: { findMany: fn().mockResolvedValue([{ id: "client-org-9", name: "Acme", settings: {} }]) },
      billingAlertEvent: { findMany: fn().mockResolvedValue([]), createMany: fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
    } as unknown as PrismaClient;
    await runBlockingSweep(prisma, "enforce", now);
    expect(sendBillingMail).toHaveBeenCalledTimes(1);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com"] });
  });
});

describe("site org id: cancellation emails", () => {
  function cancelPrisma() {
    return {
      billingCancellation: { findUnique: fn().mockResolvedValue(null), upsert: fn().mockResolvedValue({}), updateMany: fn().mockResolvedValue({ count: 1 }) },
      organization: { findUnique: fn().mockResolvedValue({ name: "Acme", createdAt: new Date("2026-03-14T09:00:00Z"), settings: {} }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
      billingSetting: { findUnique: fn().mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, chargingStartDate: "2026-10-12" } }) },
      billingStatement: { findFirst: fn().mockResolvedValue(null), findMany: fn().mockResolvedValue([]), create: fn().mockResolvedValue({}) },
      messageUsageDaily: { findMany: fn().mockResolvedValue([{ billableCount: 90000 }]) },
    } as unknown as PrismaClient;
  }
  it("request: owner notice and requester confirmation", async () => {
    await requestCancellation(cancelPrisma(), { organizationId: "client-org-9", userId: "u1", reason: "too dear" }, now);
    expect(sendBillingMail).toHaveBeenCalledTimes(1);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com"] });
    // the team notice goes to the owner and is not a customer email
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: "info@conveys.in" });
  });
  it("approval email", async () => {
    await approveCancellation(cancelPrisma(), "client-org-9", "admin-1", now);
    expect(sendBillingMail).toHaveBeenCalledTimes(1);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com"] });
  });
});

describe("site org id: payment failed and alerts emails", () => {
  it("payment failed", async () => {
    const prisma = { user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]) } } as unknown as PrismaClient;
    await notifyPaymentFailed(prisma, "client-org-9", new Date("2026-10-17T00:00:00Z"));
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com", "b@x.com"] });
  });
  it("usage alert", async () => {
    const D = (s: string) => new Date(`${s}T00:00:00Z`);
    const t = new Date("2026-10-15T10:00:00Z");
    const prisma = {
      messageUsageDaily: { findMany: fn().mockResolvedValue([{ organizationId: "client-org-9", day: D("2026-10-14"), billableCount: 300 }, { organizationId: "client-org-9", day: D("2026-10-15"), billableCount: 130 }]) },
      organization: { findMany: fn().mockResolvedValue([{ id: "client-org-9", createdAt: new Date("2026-03-14T09:00:00Z") }]) },
      billingAlertEvent: {
        createMany: fn().mockResolvedValue({ count: 2 }),
        updateMany: fn().mockResolvedValue({ count: 1 }),
        findMany: fn().mockImplementation(async (args: { where: { emailedAt: unknown } }) =>
          args.where.emailedAt === null ? [{ id: "e2", organizationId: "client-org-9", month: "2026-10-14", kind: "free_80", messages: 430 }] : []),
      },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]) },
      billingSetting: { findUnique: fn().mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, alertsEnabled: true } }) },
    } as unknown as PrismaClient;
    await evaluateAlerts(prisma, t);
    expect(sendBillingMail).toHaveBeenCalledTimes(1);
    expect(billing()).toMatchObject({ orgId: "client-org-9", to: ["a@x.com", "b@x.com"] });
  });
});

describe("site org id: owner summary stays on sendMail", () => {
  it("the weekly owner summary is never a billing mail", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("./automation.ts", import.meta.url), "utf8");
    expect(src).toMatch(/await sendMail\(\{ to: OWNER_SUMMARY_TO\(\)/);
  });
});
