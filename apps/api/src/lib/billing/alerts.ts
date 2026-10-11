import type { PrismaClient } from "@prisma/client";
import { sendMail } from "../mail.js";
import { bandViews, type BillingConfig } from "./bands.js";
import { loadBillingConfig } from "./settings.js";
import { parseMonth } from "./metering.js";

const FREE_STEPS = [50, 80, 95, 100] as const;

/**
 * Alert kinds a message count has reached this month: free_50/80/95/100 (share of the free allowance) and, only when
 * prices are published, band_N / above for each higher band entered. Pure.
 */
export function kindsReached(count: number, config: BillingConfig): string[] {
  const kinds: string[] = [];
  if (config.freeAllowance > 0) {
    for (const pct of FREE_STEPS) if (count >= Math.ceil((config.freeAllowance * pct) / 100)) kinds.push(`free_${pct}`);
  }
  if (config.published) {
    const views = bandViews(config);
    for (let i = 1; i < views.length; i++) {
      if (count >= views[i]!.from) kinds.push(i === views.length - 1 ? "above" : `band_${i}`);
    }
  }
  return kinds;
}

export function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Plain-language subject and body for an alert, without revealing prices (the billing page carries those). */
export function alertMessage(kind: string, messages: number, freeAllowance: number): { subject: string; text: string } {
  const n = messages.toLocaleString("en-US");
  const free = freeAllowance.toLocaleString("en-US");
  const m = /^free_(\d+)$/.exec(kind);
  if (m) {
    return m[1] === "100"
      ? { subject: "WBMSG: you have used your free messages for this month", text: `You have used all ${free} free messages this month (${n} counted so far).` }
      : { subject: `WBMSG: ${m[1]}% of your free messages used`, text: `You have used ${m[1]}% of your ${free} free messages this month (${n} counted so far).` };
  }
  return { subject: "WBMSG: your message volume reached a new band", text: `Your message count this month (${n}) moved into a higher band.` };
}

/** Highest-ranked kind: later band beats earlier, any band beats a free step, a higher free step beats a lower one. */
export function highestKind(kinds: string[]): string | null {
  const rank = (k: string): number => {
    if (k === "above") return 1000;
    const b = /^band_(\d+)$/.exec(k);
    if (b) return 100 + Number(b[1]);
    const f = /^free_(\d+)$/.exec(k);
    return f ? Number(f[1]) / 100 : -1;
  };
  return kinds.reduce<string | null>((best, k) => (best === null || rank(k) > rank(best) ? k : best), null);
}

/**
 * Records newly reached thresholds for every organization (idempotent) and, only when the owner has switched
 * usage-alert emails on, emails billing admins one message per organization per run (the highest unsent threshold).
 * Never throws: a failure is logged by name only and retried on the next run.
 */
export async function evaluateAlerts(prisma: PrismaClient, now: Date = new Date()): Promise<{ recorded: number; emailed: number }> {
  let recorded = 0;
  let emailed = 0;
  try {
    const config = await loadBillingConfig(prisma);
    const month = monthKey(now);
    const range = parseMonth(month)!;
    const totals = await prisma.messageUsageDaily.groupBy({
      by: ["organizationId"],
      where: { day: { gte: range.from, lt: range.toExclusive } },
      _sum: { billableCount: true },
    });
    const rows: Array<{ organizationId: string; month: string; kind: string; messages: number }> = [];
    for (const t of totals) {
      const count = t._sum.billableCount ?? 0;
      for (const kind of kindsReached(count, config)) rows.push({ organizationId: t.organizationId, month, kind, messages: count });
    }
    if (rows.length > 0) {
      const res = await prisma.billingAlertEvent.createMany({ data: rows, skipDuplicates: true });
      recorded = res.count;
    }
    if (config.alertsEnabled) emailed = await emailUnsent(prisma, month, config.freeAllowance, now);
  } catch (err) {
    console.warn("[billing-alerts] evaluation failed", err instanceof Error ? err.name : "error");
  }
  return { recorded, emailed };
}

async function emailUnsent(prisma: PrismaClient, month: string, freeAllowance: number, now: Date): Promise<number> {
  const pending = await prisma.billingAlertEvent.findMany({ where: { month, emailedAt: null }, select: { id: true, organizationId: true, kind: true, messages: true } });
  const byOrg = new Map<string, typeof pending>();
  for (const p of pending) byOrg.set(p.organizationId, [...(byOrg.get(p.organizationId) ?? []), p]);
  let sent = 0;
  for (const [organizationId, events] of byOrg) {
    try {
      const top = highestKind(events.map((e) => e.kind));
      const topEvent = events.find((e) => e.kind === top);
      if (!topEvent) continue;
      const admins = await prisma.user.findMany({ where: { organizationId, role: "admin", isActive: true, deletedAt: null }, select: { email: true } });
      const to = admins.map((a) => a.email).filter(Boolean);
      if (to.length > 0) {
        const msg = alertMessage(topEvent.kind, topEvent.messages, freeAllowance);
        await sendMail({ to, subject: msg.subject, html: `<p>${msg.text}</p><p>See details in Settings &gt; Billing.</p>` });
        sent++;
      }
      await prisma.billingAlertEvent.updateMany({ where: { id: { in: events.map((e) => e.id) }, emailedAt: null }, data: { emailedAt: now } });
    } catch (err) {
      console.warn("[billing-alerts] email failed", err instanceof Error ? err.name : "error");
    }
  }
  return sent;
}
