import type { PrismaClient } from "@prisma/client";
import { sendMail } from "../mail.js";
import { loadBillingConfig } from "./settings.js";
import { issueStatements } from "./statements.js";
import { ensurePaymentLinks } from "./statement-payment.js";
import { readBillingDetails, statementRecipients } from "./billing-details.js";
import { BLOCK_GRACE_DAYS, isExempt } from "./send-guard.js";
import { ownerEmail } from "./owner-email.js";
import { deletionDue } from "./cancellation.js";

const DAY = 86_400_000;
export const OWNER_SUMMARY_TO = ownerEmail;

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface OwnerSummaryData {
  mode: string;
  autoIssue: boolean;
  issued: string[];
  paid: string[];
  overdue: string[];
  newlyBlocked: string[];
  wouldBlock: string[];
  noLink: string[];
  /** Cancelled accounts whose 30 days are over: their data is waiting for the owner to delete it. */
  deleteData?: string[];
  /** Cancellation requests waiting for the owner's approval. */
  cancelRequests?: string[];
}

/** The owner's daily email, or null on a quiet day. Pure. */
export function buildOwnerSummary(d: OwnerSummaryData): { subject: string; html: string } | null {
  const sections: Array<[string, string[]]> = [
    ["Statements issued (last 24 hours)", d.issued],
    ["Payments received (last 24 hours)", d.paid],
    ["Overdue now", d.overdue],
    ["Newly blocked from sending", d.newlyBlocked],
    ["Would be blocked (watch mode, nothing was blocked)", d.wouldBlock],
    ["Issued but no payment link yet (customer cannot pay; never blocked)", d.noLink],
    ["Cancellation requests waiting for your approval", d.cancelRequests ?? []],
    ["Cancelled accounts past 30 days: delete their data", d.deleteData ?? []],
  ];
  if (sections.every(([, rows]) => rows.length === 0)) return null;
  const body = sections
    .filter(([, rows]) => rows.length > 0)
    .map(([title, rows]) => `<h3>${esc(title)} (${rows.length})</h3><ul>${rows.slice(0, 25).map((r) => `<li>${esc(r)}</li>`).join("")}${rows.length > 25 ? `<li>and ${rows.length - 25} more</li>` : ""}</ul>`)
    .join("");
  return {
    subject: `WBMSG billing summary: ${d.paid.length} paid, ${d.overdue.length} overdue${d.newlyBlocked.length ? `, ${d.newlyBlocked.length} newly blocked` : ""}`,
    html: `<p>Blocking mode: <strong>${esc(d.mode)}</strong>. Automatic issuing: <strong>${d.autoIssue ? "on" : "off"}</strong>.</p>${body}<p>Manage in Admin &gt; Billing.</p>`,
  };
}

/**
 * Records customers that have just passed the grace period (7 days after a statement's due date) and, only when
 * enforcement is on, tells each one once that sending is paused and how to resume. In watch mode it only records
 * "would block" so the owner can see the effect before switching enforcement on. Customers with no payment link,
 * owner organizations and paused or exempt customers are never included.
 */
export async function runBlockingSweep(prisma: PrismaClient, mode: "off" | "watch" | "enforce", now: Date = new Date()): Promise<{ blocked: Array<{ organizationId: string; month: string }>; wouldBlock: Array<{ organizationId: string; month: string }> }> {
  const empty = { blocked: [], wouldBlock: [] };
  if (mode === "off") return empty;
  const cutoff = new Date(now.getTime() - BLOCK_GRACE_DAYS * DAY);
  const due = await prisma.billingStatement.findMany({
    where: { status: "issued", paymentUrl: { not: null }, dueAt: { lte: cutoff } },
    select: { organizationId: true, month: true },
    take: 2000,
  });
  if (due.length === 0) return empty;
  const orgIds = [...new Set(due.map((d) => d.organizationId))];
  const orgs = await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, settings: true } });
  const live = new Set(orgs.filter((o) => !isExempt(o.name, o.settings, now)).map((o) => o.id));
  const rows = due.filter((d) => live.has(d.organizationId));
  if (rows.length === 0) return empty;

  const kind = mode === "enforce" ? "blocked" : "would_block";
  const existing = await prisma.billingAlertEvent.findMany({ where: { kind, organizationId: { in: [...live] } }, select: { organizationId: true, month: true } });
  const seen = new Set(existing.map((e) => `${e.organizationId}|${e.month}`));
  const fresh = rows.filter((r) => !seen.has(`${r.organizationId}|${r.month}`));
  if (fresh.length === 0) return empty;
  await prisma.billingAlertEvent.createMany({ data: fresh.map((f) => ({ organizationId: f.organizationId, month: f.month, kind, messages: 0 })), skipDuplicates: true });

  if (mode === "watch") return { blocked: [], wouldBlock: fresh };
  const byId = new Map(orgs.map((o) => [o.id, o]));
  for (const f of fresh) {
    try {
      const org = byId.get(f.organizationId);
      const admins = await prisma.user.findMany({ where: { organizationId: f.organizationId, role: "admin", isActive: true, deletedAt: null }, select: { email: true } });
      const to = statementRecipients(readBillingDetails(org?.settings), admins.map((a) => a.email).filter(Boolean));
      if (to.length === 0) continue;
      await sendMail({
        to,
        subject: "WBMSG: sending is paused until your statement is paid",
        html: `<p>Your WBMSG statement for the billing period starting ${esc(f.month)} is overdue, so sending WhatsApp messages from WBMSG is paused.</p>
<p>Pay it in <strong>Settings &gt; Billing</strong> (or with the payment link in your statement email) and sending resumes right away. You can still sign in, see your contacts and conversations, and receive messages.</p>`,
      });
    } catch (err) {
      console.warn("[billing-block] pause notice failed", err instanceof Error ? err.name : "error");
    }
  }
  return { blocked: fresh, wouldBlock: [] };
}

async function labels(prisma: PrismaClient, rows: Array<{ organizationId: string; text: string }>): Promise<string[]> {
  if (rows.length === 0) return [];
  const orgs = await prisma.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } });
  const name = new Map(orgs.map((o) => [o.id, o.name]));
  return rows.map((r) => `${name.get(r.organizationId) ?? "(deleted organization)"}: ${r.text}`);
}

/**
 * The daily billing automation, run by the 00:50 UTC job after statements are prepared:
 *  1. when the owner has switched automatic issuing on, issue the drafts (those inside the charging window) and create links;
 *  2. record / announce customers that just passed the grace period;
 *  3. send the owner one summary email (nothing on a quiet day).
 * Every step is isolated: a failure in one is logged by name and never stops the others.
 */
export async function runBillingAutomation(prisma: PrismaClient, now: Date = new Date()): Promise<{ issued: number; links: number; blocked: number; wouldBlock: number; summarySent: boolean }> {
  const out = { issued: 0, links: 0, blocked: 0, wouldBlock: 0, summarySent: false };
  let config;
  try {
    config = await loadBillingConfig(prisma);
  } catch {
    return out;
  }
  if (config.autoIssueEnabled) {
    try {
      const res = await issueStatements(prisma, now);
      out.issued = res.issued;
      out.links = await ensurePaymentLinks(prisma, now);
    } catch (err) {
      console.warn("[billing-auto] issuing failed", err instanceof Error ? err.name : "error");
    }
  }
  let sweep = { blocked: [] as Array<{ organizationId: string; month: string }>, wouldBlock: [] as Array<{ organizationId: string; month: string }> };
  try {
    sweep = await runBlockingSweep(prisma, config.blockingMode, now);
    out.blocked = sweep.blocked.length;
    out.wouldBlock = sweep.wouldBlock.length;
  } catch (err) {
    console.warn("[billing-block] sweep failed", err instanceof Error ? err.name : "error");
  }
  try {
    const since = new Date(now.getTime() - DAY);
    const [issued, paid, overdue, noLink] = await Promise.all([
      prisma.billingStatement.findMany({ where: { issuedAt: { gte: since }, status: { in: ["issued", "paid"] } }, select: { organizationId: true, month: true, amountMinor: true, currency: true }, take: 200 }),
      prisma.billingStatement.findMany({ where: { paidAt: { gte: since } }, select: { organizationId: true, month: true, amountMinor: true, currency: true }, take: 200 }),
      prisma.billingStatement.findMany({ where: { status: "issued", dueAt: { lt: now } }, select: { organizationId: true, month: true, dueAt: true }, take: 200 }),
      prisma.billingStatement.findMany({ where: { status: "issued", paymentUrl: null }, select: { organizationId: true, month: true }, take: 200 }),
    ]);
    const money = (c: string | null, m: number | null): string => (c && m ? `${c} ${(m / 100).toFixed(2)}` : "no amount");
    const summary = buildOwnerSummary({
      mode: config.blockingMode,
      autoIssue: config.autoIssueEnabled,
      issued: await labels(prisma, issued.map((s) => ({ organizationId: s.organizationId, text: `${s.month}, ${money(s.currency, s.amountMinor)}` }))),
      paid: await labels(prisma, paid.map((s) => ({ organizationId: s.organizationId, text: `${s.month}, ${money(s.currency, s.amountMinor)}` }))),
      overdue: await labels(prisma, overdue.map((s) => ({ organizationId: s.organizationId, text: `${s.month}, due ${s.dueAt?.toISOString().slice(0, 10)}` }))),
      newlyBlocked: await labels(prisma, sweep.blocked.map((s) => ({ organizationId: s.organizationId, text: s.month }))),
      wouldBlock: await labels(prisma, sweep.wouldBlock.map((s) => ({ organizationId: s.organizationId, text: s.month }))),
      noLink: await labels(prisma, noLink.map((s) => ({ organizationId: s.organizationId, text: s.month }))),
      cancelRequests: await labels(prisma, (await prisma.billingCancellation.findMany({ where: { status: "requested" }, select: { organizationId: true, requestedAt: true }, take: 100 })).map((c) => ({ organizationId: c.organizationId, text: `requested ${c.requestedAt.toISOString().slice(0, 10)}` }))),
      deleteData: await labels(prisma, (await deletionDue(prisma, now)).map((c) => ({ organizationId: c.organizationId, text: `cancelled ${c.approvedAt.toISOString().slice(0, 10)}` }))),
    });
    if (summary) {
      await sendMail({ to: OWNER_SUMMARY_TO(), subject: summary.subject, html: summary.html });
      out.summarySent = true;
    }
  } catch (err) {
    console.warn("[billing-auto] summary failed", err instanceof Error ? err.name : "error");
  }
  return out;
}
