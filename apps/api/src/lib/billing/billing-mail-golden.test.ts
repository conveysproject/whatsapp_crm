// Golden tests: the exact `sendMail` arguments of every customer-facing billing and closure email for an
// ordinary (default) organization. They were captured before Task B4b and must stay byte-identical afterwards.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { sendMail, createLink } = vi.hoisted(() => ({ sendMail: vi.fn(), createLink: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a), isEmailConfigured: () => true }));
vi.mock("../redis.js", () => ({ redis: { eval: vi.fn() } }));
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("./payment-links.js", async (orig) => ({
  ...(await orig<typeof import("./payment-links.js")>()),
  createStatementPaymentLink: (...a: unknown[]) => createLink(...a),
}));
vi.mock("./statements.js", async (orig) => ({ ...(await orig<typeof import("./statements.js")>()), issueStatements: vi.fn() }));
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
  createLink.mockReset().mockResolvedValue({ provider: "razorpay", url: "https://rzp.io/l/abc?x=WBMSG&y=1", ref: "plink_1" });
});

function sent(i = 0): unknown {
  return sendMail.mock.calls[i]![0];
}

describe("golden: statement-payment emails", () => {
  it("statement email", async () => {
    const prisma = {
      billingStatement: { findMany: fn().mockResolvedValue([{ id: "s1", organizationId: "o1", month: "2026-10-14", messages: 3240, bandName: "Band 1", amountInr: 500, amountUsd: 5 }]), updateMany: fn().mockResolvedValue({ count: 1 }) },
      organization: { findUnique: fn().mockResolvedValue({ name: "Acme", location: "Pune, India", settings: {} }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
      billingSetting: { findUnique: fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    expect(await ensurePaymentLinks(prisma, now)).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>Your WBMSG statement for the billing period starting 2026-10-14 is ready.</p>
      <p>3,240 messages counted (Band 1). Amount due: <strong>₹500.00</strong> by 27 November 2026.</p>
      <p><a href="https://rzp.io/l/abc?x=WBMSG&amp;y=1">Pay securely online</a></p>
      <p>WhatsApp's own message charges are billed to you directly by Meta; this statement is only the WBMSG fee.</p>",
        "subject": "WBMSG statement: ₹500.00 due 27 November 2026",
        "to": [
          "a@x.com",
        ],
      }
    `);
  });
  it("reminder email", async () => {
    const due = new Date("2026-11-01T00:00:00Z");
    const prisma = {
      billingStatement: { findMany: fn().mockResolvedValue([{ id: "s1", organizationId: "o1", month: "2026-10-14", currency: "INR", amountMinor: 50000, dueAt: due, paymentUrl: "https://rzp.io/l/abc", remindersSent: 0 }]), updateMany: fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
      organization: { findUnique: fn().mockResolvedValue({ settings: {} }) },
    } as unknown as PrismaClient;
    await sendPaymentReminders(prisma, new Date(due.getTime() + 4 * DAY));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>Your WBMSG statement for the billing period starting 2026-10-14 was due on 1 November 2026 and is still unpaid.</p>
      <p>Amount due: <strong>₹500.00</strong>.</p>
      <p><a href="https://rzp.io/l/abc">Pay securely online</a></p>
      <p>If you have already paid, please ignore this message.</p>",
        "subject": "Reminder: WBMSG statement of ₹500.00 is overdue",
        "to": [
          "a@x.com",
        ],
      }
    `);
  });
  it("payment received email", async () => {
    const prisma = {
      billingStatement: { findUnique: fn().mockResolvedValue({ organizationId: "o1", month: "2026-10-12", bandName: "Free", messages: 3, currency: "INR", amountMinor: 1000, paidRef: "pay_Abc123" }) },
      organization: { findUnique: fn().mockResolvedValue({ settings: {} }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
    } as unknown as PrismaClient;
    expect(await sendPaymentReceived(prisma, "s1")).toBe(true);
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>Thank you. We have received your payment of <strong>₹10.00</strong> for the WBMSG billing period starting 2026-10-12.</p>
      <p>3 messages counted (Free). Payment reference: pay_Abc123.</p>
      <p>You can download the invoice any time from Settings &gt; Billing.</p>",
        "subject": "WBMSG: payment received, ₹10.00",
        "to": [
          "a@x.com",
        ],
      }
    `);
  });
});

describe("golden: blocking sweep email", () => {
  it("pause notice", async () => {
    const prisma = {
      billingStatement: { findMany: fn().mockResolvedValue([{ organizationId: "o1", month: "2026-10-14" }]) },
      organization: { findMany: fn().mockResolvedValue([{ id: "o1", name: "Acme", settings: {} }]) },
      billingAlertEvent: { findMany: fn().mockResolvedValue([]), createMany: fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }]) },
    } as unknown as PrismaClient;
    await runBlockingSweep(prisma, "enforce", now);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>Your WBMSG statement for the billing period starting 2026-10-14 is overdue, so sending WhatsApp messages from WBMSG is paused.</p>
      <p>Pay it in <strong>Settings &gt; Billing</strong> (or with the payment link in your statement email) and sending resumes right away. You can still sign in, see your contacts and conversations, and receive messages.</p>",
        "subject": "WBMSG: sending is paused until your statement is paid",
        "to": [
          "a@x.com",
        ],
      }
    `);
  });
});

describe("golden: cancellation emails", () => {
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
    await requestCancellation(cancelPrisma(), { organizationId: "o1", userId: "u1", reason: "too dear" }, now);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map((c) => c[0])).toMatchInlineSnapshot(`
      [
        {
          "html": "<p><strong>Acme</strong> asked to cancel their account.</p><p>Reason: too dear</p><p>Approve or dismiss it in Admin &gt; Billing &gt; Cancellation requests.</p>",
          "subject": "WBMSG cancellation request: Acme",
          "to": "info@conveys.in",
        },
        {
          "html": "<p>We received your request to cancel your WBMSG account. We will confirm shortly. Until we do, nothing changes and you can withdraw the request in Settings &gt; Billing.</p>",
          "subject": "WBMSG: we received your cancellation request",
          "to": [
            "a@x.com",
          ],
        },
      ]
    `);
  });
  it("approval email", async () => {
    await approveCancellation(cancelPrisma(), "o1", "admin-1", now);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>Your WBMSG account has been cancelled. Sending WhatsApp messages from WBMSG is now off.</p>
      <p>Your final statement is in your inbox with a payment link, and in Settings &gt; Billing. You can still sign in and export your contacts and conversations for 30 days, then your data is deleted.</p>
      <p>If this is a mistake, write to info@conveys.in.</p>",
        "subject": "WBMSG: your account has been cancelled",
        "to": [
          "a@x.com",
        ],
      }
    `);
  });
});

describe("golden: payment failed and alerts emails", () => {
  it("payment failed", async () => {
    const prisma = { user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]) } } as unknown as PrismaClient;
    await notifyPaymentFailed(prisma, "org-1", new Date("2026-10-17T00:00:00Z"));
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>We could not process your latest WBMSG subscription payment.</p>
      <p>Please update your payment method in Settings &gt; Billing before <strong>17 October 2026</strong> to keep your current plan. After that date your account moves to the Starter plan.</p>",
        "subject": "WBMSG: your last payment failed",
        "to": [
          "a@x.com",
          "b@x.com",
        ],
      }
    `);
  });
  it("usage alert", async () => {
    const D = (s: string) => new Date(`${s}T00:00:00Z`);
    const t = new Date("2026-10-15T10:00:00Z");
    const prisma = {
      messageUsageDaily: { findMany: fn().mockResolvedValue([{ organizationId: "o1", day: D("2026-10-14"), billableCount: 300 }, { organizationId: "o1", day: D("2026-10-15"), billableCount: 130 }]) },
      organization: { findMany: fn().mockResolvedValue([{ id: "o1", createdAt: new Date("2026-03-14T09:00:00Z") }]) },
      billingAlertEvent: {
        createMany: fn().mockResolvedValue({ count: 2 }),
        updateMany: fn().mockResolvedValue({ count: 1 }),
        findMany: fn().mockImplementation(async (args: { where: { emailedAt: unknown } }) =>
          args.where.emailedAt === null ? [{ id: "e2", organizationId: "o1", month: "2026-10-14", kind: "free_80", messages: 430 }] : []),
      },
      user: { findMany: fn().mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]) },
      billingSetting: { findUnique: fn().mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, alertsEnabled: true } }) },
    } as unknown as PrismaClient;
    await evaluateAlerts(prisma, t);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchInlineSnapshot(`
      {
        "html": "<p>You have used 80% of your 500 free messages this month (430 counted so far).</p><p>See details in Settings &gt; Billing.</p>",
        "subject": "WBMSG: 80% of your free messages used",
        "to": [
          "a@x.com",
          "b@x.com",
        ],
      }
    `);
  });
});
