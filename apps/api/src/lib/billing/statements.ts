import type { PrismaClient } from "@prisma/client";
import { planFor, type BillingConfig } from "./bands.js";
import { loadBillingConfig } from "./settings.js";
import { parseMonth } from "./metering.js";

export interface StatementDraft {
  organizationId: string;
  month: string;
  messages: number;
  bandName: string;
  amountInr: number | null;
  amountUsd: number | null;
}

/** The statement for a month's message count. Always priced from the band table, whether or not prices are published to customers. */
export function priceStatement(organizationId: string, month: string, messages: number, config: BillingConfig): StatementDraft {
  const plan = planFor(messages, { ...config, published: true });
  if (!plan.published) throw new Error("unreachable: forced published");
  return { organizationId, month, messages, bandName: plan.current.name, amountInr: plan.current.inr, amountUsd: plan.current.usd };
}

/** The UTC month before `now`, as YYYY-MM. */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Prepares draft statements for a finished UTC month from the daily rollup. Idempotent: drafts are refreshed, anything
 * already issued or void is left untouched. Organizations with no counted messages get no statement. Never charges.
 */
export async function generateStatements(prisma: PrismaClient, month: string, now: Date = new Date()): Promise<{ created: number; refreshed: number; skipped: number }> {
  const range = parseMonth(month);
  if (!range) throw new Error("invalid month");
  if (range.toExclusive.getTime() > now.getTime()) throw new Error("month has not finished");
  const config = await loadBillingConfig(prisma);
  const totals = await prisma.messageUsageDaily.groupBy({
    by: ["organizationId"],
    where: { day: { gte: range.from, lt: range.toExclusive } },
    _sum: { billableCount: true },
  });
  const existing = await prisma.billingStatement.findMany({ where: { month }, select: { organizationId: true, status: true } });
  const statusByOrg = new Map(existing.map((e) => [e.organizationId, e.status]));
  let created = 0;
  let refreshed = 0;
  let skipped = 0;
  for (const t of totals) {
    const messages = t._sum.billableCount ?? 0;
    if (messages <= 0) continue;
    const d = priceStatement(t.organizationId, month, messages, config);
    const status = statusByOrg.get(t.organizationId);
    if (status === undefined) {
      await prisma.billingStatement.create({ data: { ...d, status: "draft" } });
      created++;
    } else if (status === "draft") {
      await prisma.billingStatement.updateMany({
        where: { organizationId: t.organizationId, month, status: "draft" },
        data: { messages: d.messages, bandName: d.bandName, amountInr: d.amountInr, amountUsd: d.amountUsd, updatedAt: now },
      });
      refreshed++;
    } else {
      skipped++;
    }
  }
  return { created, refreshed, skipped };
}
