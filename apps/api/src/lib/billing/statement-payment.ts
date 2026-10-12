import type { PrismaClient } from "@prisma/client";
import { sendMail } from "../mail.js";
import { createStatementPaymentLink, currencyForOrg, type PaymentProvider } from "./payment-links.js";
import { readBillingDetails, statementRecipients } from "./billing-details.js";
import { loadBillingConfig } from "./settings.js";
import { clearStandingCache } from "./send-guard.js";

export const DUE_DAYS = 7;
/** Reminder schedule: days after the due date. Reminders only: nothing is ever blocked or limited. */
export const REMINDER_OFFSETS_DAYS = [3, 7, 14] as const;

const DAY = 86_400_000;

async function adminEmails(prisma: PrismaClient, organizationId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { organizationId, role: "admin", isActive: true, deletedAt: null }, select: { email: true } });
  return admins.map((a) => a.email).filter(Boolean);
}

function money(currency: string, minor: number): string {
  const v = (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${v}` : `$${v}`;
}

function dateText(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Gives every issued statement that has no payment link one: fixes currency and amount, sets the due date (7 days),
 * creates the gateway link and emails billing admins. A failure on one statement is logged by name only and retried on
 * the next run. Returns how many links were created.
 */
export async function ensurePaymentLinks(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const pending = await prisma.billingStatement.findMany({
    where: { status: "issued", paymentUrl: null },
    select: { id: true, organizationId: true, month: true, messages: true, bandName: true, amountInr: true, amountUsd: true },
    take: 500,
  });
  const config = await loadBillingConfig(prisma);
  let created = 0;
  for (const st of pending) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: st.organizationId }, select: { name: true, phone: true, location: true, settings: true } });
      if (!org) continue;
      const currency = currencyForOrg(org);
      const major = currency === "INR" ? st.amountInr : st.amountUsd;
      if (!major || major <= 0) continue;
      // GST applies to INR (domestic) statements only, and only when the owner has set a rate.
      const baseMinor = major * 100;
      const taxMinor = currency === "INR" && config.gstRatePercent > 0 ? Math.round((baseMinor * config.gstRatePercent) / 100) : null;
      const amountMinor = baseMinor + (taxMinor ?? 0);
      const dueAt = new Date(now.getTime() + DUE_DAYS * DAY);
      const emails = statementRecipients(readBillingDetails(org.settings), await adminEmails(prisma, st.organizationId));
      const description = `WBMSG messaging fee, billing period from ${st.month}`;
      const link = await createStatementPaymentLink({ statementId: st.id, organizationId: st.organizationId, currency, amountMinor, description, dueAt, customerEmail: emails[0] ?? null });
      const res = await prisma.billingStatement.updateMany({
        where: { id: st.id, status: "issued", paymentUrl: null },
        data: { currency, amountMinor, taxMinor, dueAt, paymentUrl: link.url, paymentProvider: link.provider, paymentRef: link.ref, updatedAt: now },
      });
      if (res.count !== 1) continue;
      created++;
      if (emails.length > 0) {
        await sendMail({
          to: emails,
          subject: `WBMSG statement: ${money(currency, amountMinor)} due ${dateText(dueAt)}`,
          html: `<p>Your WBMSG statement for the billing period starting ${esc(st.month)} is ready.</p>
<p>${st.messages.toLocaleString("en-US")} messages counted (${esc(st.bandName)}). Amount due: <strong>${money(currency, amountMinor)}</strong> by ${dateText(dueAt)}.</p>
<p><a href="${esc(link.url)}">Pay securely online</a></p>
<p>WhatsApp's own message charges are billed to you directly by Meta; this statement is only the WBMSG fee.</p>`,
        }).catch((err: unknown) => console.warn("[billing-pay] statement email failed", err instanceof Error ? err.name : "error"));
      }
    } catch (err) {
      console.warn("[billing-pay] payment link failed", err instanceof Error ? err.message.slice(0, 80) : "error");
    }
  }
  return created;
}

/**
 * Emails overdue reminders for issued, unpaid statements: 3, 7 and 14 days after the due date. Reminders only.
 * The counter is advanced atomically, so two overlapping runs cannot send the same reminder twice.
 */
export async function sendPaymentReminders(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const open = await prisma.billingStatement.findMany({
    where: { status: "issued", paymentUrl: { not: null }, dueAt: { not: null }, remindersSent: { lt: REMINDER_OFFSETS_DAYS.length } },
    select: { id: true, organizationId: true, month: true, currency: true, amountMinor: true, dueAt: true, paymentUrl: true, remindersSent: true },
    take: 1000,
  });
  let sent = 0;
  for (const st of open) {
    if (!st.dueAt || !st.paymentUrl || !st.currency || !st.amountMinor) continue;
    const offset = REMINDER_OFFSETS_DAYS[st.remindersSent]!;
    if (now.getTime() < st.dueAt.getTime() + offset * DAY) continue;
    const claimed = await prisma.billingStatement.updateMany({ where: { id: st.id, status: "issued", remindersSent: st.remindersSent }, data: { remindersSent: st.remindersSent + 1 } });
    if (claimed.count !== 1) continue;
    try {
      const org = await prisma.organization.findUnique({ where: { id: st.organizationId }, select: { settings: true } });
      const emails = statementRecipients(readBillingDetails(org?.settings), await adminEmails(prisma, st.organizationId));
      if (emails.length === 0) continue;
      await sendMail({
        to: emails,
        subject: `Reminder: WBMSG statement of ${money(st.currency, st.amountMinor)} is overdue`,
        html: `<p>Your WBMSG statement for the billing period starting ${esc(st.month)} was due on ${dateText(st.dueAt)} and is still unpaid.</p>
<p>Amount due: <strong>${money(st.currency, st.amountMinor)}</strong>.</p>
<p><a href="${esc(st.paymentUrl)}">Pay securely online</a></p>
<p>If you have already paid, please ignore this message.</p>`,
      });
      sent++;
    } catch (err) {
      console.warn("[billing-pay] reminder failed", err instanceof Error ? err.name : "error");
    }
  }
  return sent;
}

export type PaidResult = "paid" | "already_paid" | "not_found" | "rejected";

const PAYMENT_ID = /^[A-Za-z0-9_]{1,64}$/;

/**
 * Marks a statement paid from a verified gateway webhook. Accepts only when the statement is issued, the webhook came
 * from the same provider and named the same payment link that was created for it, the currency matches and the paid
 * amount covers the amount due. Anything else changes nothing. On success the gateway's payment id is kept for the
 * invoice and the billing contact is emailed a "payment received" note (best effort, once).
 */
export async function markStatementPaid(
  prisma: PrismaClient,
  input: { statementId: string; provider: PaymentProvider; linkRef: string; currency: string; amountMinor: number; paymentId?: string },
  now: Date = new Date(),
): Promise<PaidResult> {
  const st = await prisma.billingStatement.findUnique({
    where: { id: input.statementId },
    select: { status: true, organizationId: true, currency: true, amountMinor: true, paymentProvider: true, paymentRef: true },
  });
  if (!st) return "not_found";
  if (st.status === "paid") return "already_paid";
  if (st.status !== "issued") return "rejected";
  if (st.paymentProvider !== input.provider || !st.paymentRef || st.paymentRef !== input.linkRef) return "rejected";
  if (!st.currency || st.currency.toUpperCase() !== input.currency.toUpperCase()) return "rejected";
  if (!st.amountMinor || !Number.isFinite(input.amountMinor) || input.amountMinor < st.amountMinor) return "rejected";
  const paidRef = input.paymentId && PAYMENT_ID.test(input.paymentId) ? input.paymentId : null;
  const res = await prisma.billingStatement.updateMany({
    where: { id: input.statementId, status: "issued" },
    data: { status: "paid", paidAt: now, updatedAt: now, paymentRef: input.linkRef, paidRef },
  });
  if (res.count !== 1) return "already_paid";
  // Paying lifts a sending pause within seconds instead of waiting for the one-minute standing cache.
  if (typeof st.organizationId === "string") clearStandingCache(st.organizationId);
  await sendPaymentReceived(prisma, input.statementId).catch((err: unknown) =>
    console.warn("[billing-pay] payment-received email failed", err instanceof Error ? err.name : "error"));
  return "paid";
}

/** "Payment received" note to the billing contact (billing email if set, otherwise the admins). Throws on failure; the caller logs. */
export async function sendPaymentReceived(prisma: PrismaClient, statementId: string): Promise<boolean> {
  const st = await prisma.billingStatement.findUnique({
    where: { id: statementId },
    select: { organizationId: true, month: true, bandName: true, messages: true, currency: true, amountMinor: true, paidRef: true },
  });
  if (!st || !st.currency || !st.amountMinor) return false;
  const org = await prisma.organization.findUnique({ where: { id: st.organizationId }, select: { settings: true } });
  const to = statementRecipients(readBillingDetails(org?.settings), await adminEmails(prisma, st.organizationId));
  if (to.length === 0) return false;
  await sendMail({
    to,
    subject: `WBMSG: payment received, ${money(st.currency, st.amountMinor)}`,
    html: `<p>Thank you. We have received your payment of <strong>${money(st.currency, st.amountMinor)}</strong> for the WBMSG billing period starting ${esc(st.month)}.</p>
<p>${st.messages.toLocaleString("en-US")} messages counted (${esc(st.bandName)}).${st.paidRef ? ` Payment reference: ${esc(st.paidRef)}.` : ""}</p>
<p>You can download the invoice any time from Settings &gt; Billing.</p>`,
  });
  return true;
}
