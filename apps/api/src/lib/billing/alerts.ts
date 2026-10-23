import type { PrismaClient } from "@prisma/client";
import { sendBillingMail } from "./billing-mail.js";
import { bandViews, type BillingConfig } from "./bands.js";
import { loadBillingConfig } from "./settings.js";
import { kindWanted, readAlertPrefs } from "./alert-prefs.js";
import { cycleContaining } from "./cycle.js";

const FREE_STEPS = [50, 80, 95, 100] as const;

/**
 * Alert kinds a message count has reached this month: free_50/80/95/100 (share of the free allowance) and, only when
 * prices are published, band_N for each higher band entered. Pure.
 */
export function kindsReached(count: number, config: BillingConfig): string[] {
  const kinds: string[] = [];
  if (config.freeAllowance > 0) {
    for (const pct of FREE_STEPS) if (count >= Math.ceil((config.freeAllowance * pct) / 100)) kinds.push(`free_${pct}`);
  }
  if (config.published) {
    const views = bandViews(config);
    for (let i = 1; i < views.length; i++) {
      if (count >= views[i]!.from) kinds.push(`band_${i}`);
    }
  }
  return kinds;
}

/** Legacy calendar-month key (YYYY-MM) used before billing cycles; read only to avoid re-emailing. */
export function legacyMonthKey(now: Date): string {
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
 * Records newly reached thresholds for every organization on its own billing cycle (idempotent) and, only when the
 * owner has switched usage-alert emails on, emails billing admins one message per organization per run (the highest
 * unsent threshold). Never throws: a failure is logged by name only and retried on the next run.
 */
export async function evaluateAlerts(prisma: PrismaClient, now: Date = new Date()): Promise<{ recorded: number; emailed: number }> {
  let recorded = 0;
  let emailed = 0;
  try {
    const config = await loadBillingConfig(prisma);
    // A cycle is at most 31 days; fetch a little more than that and sum each organization over its own cycle.
    const since = new Date(now.getTime() - 32 * 86_400_000);
    const days = await prisma.messageUsageDaily.findMany({ where: { day: { gte: since } }, select: { organizationId: true, day: true, billableCount: true } });
    const orgIds = [...new Set(days.map((d) => d.organizationId))];
    const orgs = orgIds.length > 0 ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, createdAt: true, settings: true } }) : [];
    const keyByOrg = new Map<string, string>();
    const settingsByOrg = new Map<string, unknown>(orgs.map((o) => [o.id, o.settings]));
    const rows: Array<{ organizationId: string; month: string; kind: string; messages: number }> = [];
    for (const org of orgs) {
      const cycle = cycleContaining(org.createdAt, now);
      keyByOrg.set(org.id, cycle.key);
      let count = 0;
      for (const d of days) {
        if (d.organizationId === org.id && d.day >= cycle.start && d.day < cycle.endExclusive) count += d.billableCount;
      }
      for (const kind of kindsReached(count, config)) rows.push({ organizationId: org.id, month: cycle.key, kind, messages: count });
    }
    if (rows.length > 0) {
      const res = await prisma.billingAlertEvent.createMany({ data: rows, skipDuplicates: true });
      recorded = res.count;
    }
    if (config.alertsEnabled) emailed = await emailUnsent(prisma, keyByOrg, settingsByOrg, config.freeAllowance, now);
  } catch (err) {
    console.warn("[billing-alerts] evaluation failed", err instanceof Error ? err.name : "error");
  }
  return { recorded, emailed };
}

async function emailUnsent(prisma: PrismaClient, keyByOrg: Map<string, string>, settingsByOrg: Map<string, unknown>, freeAllowance: number, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 35 * 86_400_000);
  const unsent = await prisma.billingAlertEvent.findMany({ where: { emailedAt: null, createdAt: { gte: since } }, select: { id: true, organizationId: true, month: true, kind: true, messages: true } });
  // Only the organization's current cycle; older unsent rows (and legacy calendar-month rows) are never sent late.
  const pending = unsent.filter((e) => keyByOrg.get(e.organizationId) === e.month);
  // Switching from calendar months to cycles must not re-send what the calendar-month rows already emailed.
  const legacy = await prisma.billingAlertEvent.findMany({ where: { month: legacyMonthKey(now), emailedAt: { not: null } }, select: { organizationId: true, kind: true } });
  const alreadySent = new Set(legacy.map((l) => `${l.organizationId}|${l.kind}`));
  const covered = pending.filter((e) => alreadySent.has(`${e.organizationId}|${e.kind}`));
  if (covered.length > 0) await prisma.billingAlertEvent.updateMany({ where: { id: { in: covered.map((e) => e.id) }, emailedAt: null }, data: { emailedAt: now } });
  const candidates = pending.filter((e) => !alreadySent.has(`${e.organizationId}|${e.kind}`));
  // The organization's own preferences: an alert it switched off (or all email) is marked handled so it is never sent late.
  const wanted = (e: (typeof candidates)[number]): boolean => {
    const prefs = readAlertPrefs(settingsByOrg.get(e.organizationId));
    return prefs.email && kindWanted(prefs, e.kind);
  };
  const toSend = candidates.filter(wanted);
  const declined = candidates.filter((e) => !wanted(e));
  if (declined.length > 0) await prisma.billingAlertEvent.updateMany({ where: { id: { in: declined.map((e) => e.id) }, emailedAt: null }, data: { emailedAt: now } });
  const byOrg = new Map<string, typeof toSend>();
  for (const p of toSend) byOrg.set(p.organizationId, [...(byOrg.get(p.organizationId) ?? []), p]);
  let sent = 0;
  for (const [organizationId, events] of byOrg) {
    try {
      const top = highestKind(events.map((e) => e.kind));
      const topEvent = events.find((e) => e.kind === top);
      if (!topEvent) continue;
      const admins = await prisma.user.findMany({ where: { organizationId, role: "admin", isActive: true, deletedAt: null }, select: { email: true } });
      const to = admins.map((x) => x.email).filter(Boolean);
      if (to.length > 0) {
        const msg = alertMessage(topEvent.kind, topEvent.messages, freeAllowance);
        await sendBillingMail(prisma, { orgId: organizationId, to, subject: msg.subject, html: `<p>${msg.text}</p><p>See details in Settings &gt; Billing.</p>` });
        sent++;
      }
      await prisma.billingAlertEvent.updateMany({ where: { id: { in: events.map((e) => e.id) }, emailedAt: null }, data: { emailedAt: now } });
    } catch (err) {
      console.warn("[billing-alerts] email failed", err instanceof Error ? err.name : "error");
    }
  }
  return sent;
}
