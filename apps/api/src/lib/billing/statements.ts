import type { PrismaClient } from "@prisma/client";
import { planFor, type BillingConfig } from "./bands.js";
import { loadBillingConfig } from "./settings.js";
import { cycleEndingOn, type Cycle } from "./cycle.js";
import { utcDayStart } from "./metering.js";

export interface StatementDraft {
  organizationId: string;
  /** Cycle key: the cycle's start date, YYYY-MM-DD. */
  month: string;
  messages: number;
  bandName: string;
  amountInr: number | null;
  amountUsd: number | null;
}

/** The statement for a cycle's message count. Always priced from the band table, whether or not prices are published to customers. */
export function priceStatement(organizationId: string, month: string, messages: number, config: BillingConfig): StatementDraft {
  const plan = planFor(messages, { ...config, published: true });
  if (!plan.published) throw new Error("unreachable: forced published");
  return { organizationId, month, messages, bandName: plan.current.name, amountInr: plan.current.inr, amountUsd: plan.current.usd };
}

/**
 * Prepares draft statements for every organization whose billing cycle ended at 00:00 UTC on `day` (organizations are
 * billed on their registration day, so a different set ends each day). Idempotent: drafts are refreshed, anything already
 * issued or void is left untouched. Organizations with no counted messages get no statement. Never charges.
 */
export async function generateStatements(prisma: PrismaClient, day: Date, now: Date = new Date()): Promise<{ created: number; refreshed: number; skipped: number }> {
  const boundary = utcDayStart(day);
  if (boundary.getTime() !== day.getTime()) throw new Error("day must be a UTC midnight");
  if (boundary.getTime() > utcDayStart(now).getTime()) throw new Error("day has not arrived");

  const orgs = await prisma.organization.findMany({ select: { id: true, createdAt: true } });
  const ended = new Map<string, Cycle>();
  for (const o of orgs) {
    const c = cycleEndingOn(o.createdAt, boundary);
    if (c) ended.set(o.id, c);
  }
  if (ended.size === 0) return { created: 0, refreshed: 0, skipped: 0 };

  const ids = [...ended.keys()];
  const earliest = new Date(Math.min(...[...ended.values()].map((c) => c.start.getTime())));
  const usage = await prisma.messageUsageDaily.findMany({
    where: { organizationId: { in: ids }, day: { gte: earliest, lt: boundary } },
    select: { organizationId: true, day: true, billableCount: true },
  });
  const totals = new Map<string, number>();
  for (const u of usage) {
    const c = ended.get(u.organizationId);
    if (c && u.day >= c.start && u.day < c.endExclusive) totals.set(u.organizationId, (totals.get(u.organizationId) ?? 0) + u.billableCount);
  }

  const keys = [...new Set([...ended.values()].map((c) => c.key))];
  const existing = await prisma.billingStatement.findMany({ where: { organizationId: { in: ids }, month: { in: keys } }, select: { organizationId: true, month: true, status: true } });
  const statusOf = new Map(existing.map((e) => [`${e.organizationId}|${e.month}`, e.status]));

  const config = await loadBillingConfig(prisma);
  let created = 0;
  let refreshed = 0;
  let skipped = 0;
  for (const [organizationId, cycle] of ended) {
    const messages = totals.get(organizationId) ?? 0;
    if (messages <= 0) continue;
    const d = priceStatement(organizationId, cycle.key, messages, config);
    const status = statusOf.get(`${organizationId}|${cycle.key}`);
    if (status === undefined) {
      await prisma.billingStatement.create({ data: { ...d, status: "draft" } });
      created++;
    } else if (status === "draft") {
      await prisma.billingStatement.updateMany({
        where: { organizationId, month: cycle.key, status: "draft" },
        data: { messages: d.messages, bandName: d.bandName, amountInr: d.amountInr, amountUsd: d.amountUsd, updatedAt: now },
      });
      refreshed++;
    } else {
      skipped++;
    }
  }
  return { created, refreshed, skipped };
}
