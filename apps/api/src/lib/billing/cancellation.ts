import type { PrismaClient } from "@prisma/client";
import { sendMail } from "../mail.js";
import { cycleContaining } from "./cycle.js";
import { loadBillingConfig } from "./settings.js";
import { priceStatement } from "./statements.js";
import { ensurePaymentLinks } from "./statement-payment.js";
import { readBillingDetails, statementRecipients } from "./billing-details.js";
import { INTERNAL_ORG_NAMES } from "./internal-orgs.js";
import { runMeteringSweep } from "./metering-sweep.js";
import { clearStandingCache } from "./send-guard.js";
import { ownerEmail } from "./owner-email.js";

/** After approval the account is kept this long so the customer can export data and pay; the owner then deletes it by hand. */
export const RETENTION_DAYS = 30;
const DAY = 86_400_000;
const REASON_MAX = 500;

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type CancellationStatus = "requested" | "approved" | "withdrawn";

export interface CancellationView {
  status: CancellationStatus;
  requestedAt: Date;
  approvedAt: Date | null;
  /** When the owner should delete the data (approval + 30 days). */
  deleteAfter: Date | null;
}

export function viewOf(row: { status: string; requestedAt: Date; approvedAt: Date | null }): CancellationView {
  const status: CancellationStatus = row.status === "requested" || row.status === "approved" ? row.status : "withdrawn";
  return { status, requestedAt: row.requestedAt, approvedAt: row.approvedAt, deleteAfter: row.approvedAt ? new Date(row.approvedAt.getTime() + RETENTION_DAYS * DAY) : null };
}

async function recipientsFor(prisma: PrismaClient, organizationId: string): Promise<string[]> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const admins = await prisma.user.findMany({ where: { organizationId, role: "admin", isActive: true, deletedAt: null }, select: { email: true } });
  return statementRecipients(readBillingDetails(org?.settings), admins.map((a) => a.email).filter(Boolean));
}

/** The customer asks to cancel. One request per organization; asking again after a withdrawal reopens it. */
export async function requestCancellation(prisma: PrismaClient, input: { organizationId: string; userId: string; reason: string | null }, now: Date = new Date()): Promise<"created" | "exists"> {
  const reason = input.reason ? input.reason.trim().slice(0, REASON_MAX) || null : null;
  const existing = await prisma.billingCancellation.findUnique({ where: { organizationId: input.organizationId }, select: { status: true } });
  if (existing && (existing.status === "requested" || existing.status === "approved")) return "exists";
  await prisma.billingCancellation.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, status: "requested", requestedAt: now, requestedBy: input.userId, reason },
    update: { status: "requested", requestedAt: now, requestedBy: input.userId, reason, approvedAt: null, approvedBy: null, updatedAt: now },
  });
  const org = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } });
  await Promise.all([
    sendMail({
      to: ownerEmail(),
      subject: `WBMSG cancellation request: ${org?.name ?? input.organizationId}`,
      html: `<p><strong>${esc(org?.name ?? input.organizationId)}</strong> asked to cancel their account.</p>${reason ? `<p>Reason: ${esc(reason)}</p>` : ""}<p>Approve or dismiss it in Admin &gt; Billing &gt; Cancellation requests.</p>`,
    }),
    recipientsFor(prisma, input.organizationId).then((to) => to.length > 0
      ? sendMail({ to, subject: "WBMSG: we received your cancellation request", html: "<p>We received your request to cancel your WBMSG account. We will confirm shortly. Until we do, nothing changes and you can withdraw the request in Settings &gt; Billing.</p>" })
      : undefined),
  ]).catch((err: unknown) => console.warn("[billing-cancel] request email failed", err instanceof Error ? err.name : "error"));
  return "created";
}

/** The customer withdraws a request the owner has not approved yet. */
export async function withdrawCancellation(prisma: PrismaClient, organizationId: string, now: Date = new Date()): Promise<boolean> {
  const res = await prisma.billingCancellation.updateMany({ where: { organizationId, status: "requested" }, data: { status: "withdrawn", updatedAt: now } });
  return res.count === 1;
}

export interface FinalStatementResult {
  created: boolean;
  reason?: "internal" | "not_billable" | "exists";
  month?: string;
  messages?: number;
  status?: "issued" | "no_payment";
}

/**
 * The final statement for the part-cycle up to now: the same bands applied to the messages counted so far (no
 * proration), issued at once (payment link and email follow). Not billable when the cycle started before the owner's
 * charging start date, when charging is not configured, or for the owner's own organizations. If a statement already
 * exists for the cycle it is left alone.
 */
export async function createFinalStatement(prisma: PrismaClient, organizationId: string, now: Date = new Date()): Promise<FinalStatementResult> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, createdAt: true } });
  if (!org) return { created: false, reason: "not_billable" };
  if (INTERNAL_ORG_NAMES.includes(org.name)) return { created: false, reason: "internal" };
  const config = await loadBillingConfig(prisma);
  const cycle = cycleContaining(org.createdAt, now);
  if (!config.chargingStartDate || cycle.key < config.chargingStartDate) return { created: false, reason: "not_billable", month: cycle.key };
  const existing = await prisma.billingStatement.findFirst({ where: { organizationId, month: cycle.key }, select: { id: true } });
  if (existing) return { created: false, reason: "exists", month: cycle.key };
  // Bring today's count up to date, then total the cycle so far.
  await runMeteringSweep(prisma, now, 1);
  const rows = await prisma.messageUsageDaily.findMany({ where: { organizationId, day: { gte: cycle.start, lt: new Date(now.getTime() + DAY) } }, select: { billableCount: true } });
  const messages = rows.reduce((s, r) => s + r.billableCount, 0);
  const priced = priceStatement(organizationId, cycle.key, messages, config);
  const status = priced.amountInr === 0 ? "no_payment" : "issued";
  await prisma.billingStatement.create({ data: { ...priced, status, issuedAt: now } });
  if (status === "issued") await ensurePaymentLinks(prisma, now);
  return { created: true, month: cycle.key, messages, status };
}

/**
 * Owner approves: sending stops immediately, the final statement is issued, and the customer is told how long they
 * have to export their data. Returns false if there is no open request.
 */
export async function approveCancellation(prisma: PrismaClient, organizationId: string, approvedBy: string, now: Date = new Date()): Promise<{ approved: boolean; statement?: FinalStatementResult }> {
  const res = await prisma.billingCancellation.updateMany({ where: { organizationId, status: "requested" }, data: { status: "approved", approvedAt: now, approvedBy, updatedAt: now } });
  if (res.count !== 1) return { approved: false };
  clearStandingCache(organizationId);
  let statement: FinalStatementResult | undefined;
  try {
    statement = await createFinalStatement(prisma, organizationId, now);
  } catch (err) {
    console.warn("[billing-cancel] final statement failed", err instanceof Error ? err.name : "error");
  }
  try {
    const to = await recipientsFor(prisma, organizationId);
    if (to.length > 0) {
      await sendMail({
        to,
        subject: "WBMSG: your account has been cancelled",
        html: `<p>Your WBMSG account has been cancelled. Sending WhatsApp messages from WBMSG is now off.</p>
<p>${statement?.status === "issued" ? "Your final statement is in your inbox with a payment link, and in Settings &gt; Billing." : "You have no final amount to pay."} You can still sign in and export your contacts and conversations for ${RETENTION_DAYS} days, then your data is deleted.</p>
<p>If this is a mistake, write to info@conveys.in.</p>`,
      });
    }
  } catch (err) {
    console.warn("[billing-cancel] approval email failed", err instanceof Error ? err.name : "error");
  }
  return { approved: true, statement };
}

/** Owner dismisses a request, or reactivates an approved cancellation (sending resumes within a minute). */
export async function reopenAccount(prisma: PrismaClient, organizationId: string, now: Date = new Date()): Promise<boolean> {
  const res = await prisma.billingCancellation.updateMany({ where: { organizationId, status: { in: ["requested", "approved"] } }, data: { status: "withdrawn", updatedAt: now } });
  clearStandingCache(organizationId);
  return res.count === 1;
}

/** Cancelled accounts whose 30 days are over and whose data the owner has still to delete. */
export async function deletionDue(prisma: PrismaClient, now: Date = new Date()): Promise<Array<{ organizationId: string; approvedAt: Date }>> {
  const rows = await prisma.billingCancellation.findMany({ where: { status: "approved", approvedAt: { lte: new Date(now.getTime() - RETENTION_DAYS * DAY) } }, select: { organizationId: true, approvedAt: true } });
  return rows.filter((r): r is { organizationId: string; approvedAt: Date } => r.approvedAt !== null);
}
