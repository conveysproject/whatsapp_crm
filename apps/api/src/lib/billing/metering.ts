import { Prisma, type PrismaClient } from "@prisma/client";

export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
export function utcDayKey(d: Date): string {
  return utcDayStart(d).toISOString().slice(0, 10);
}

export function parseMonth(m: string): { from: Date; toExclusive: Date; days: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const from = new Date(Date.UTC(year, month - 1, 1));
  const toExclusive = new Date(Date.UTC(year, month, 1));
  return { from, toExclusive, days: Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000) };
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1]!;
}

export function bucketOf(n: number): "0-99" | "100-999" | "1k-4.9k" | "5k-24.9k" | "25k-99.9k" | "100k+" {
  if (n < 100) return "0-99";
  if (n < 1000) return "100-999";
  if (n < 5000) return "1k-4.9k";
  if (n < 25000) return "5k-24.9k";
  if (n < 100000) return "25k-99.9k";
  return "100k+";
}

export interface DailyOrgCount { organizationId: string; billable: number; bySource: Record<string, number> }

/** Billable outbound messages of one UTC day, per organization and source. Literals (not parameters) for the enum comparisons. */
export async function computeDailyUsage(prisma: PrismaClient, day: Date): Promise<DailyOrgCount[]> {
  const start = utcDayStart(day);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ organization_id: string; source: string | null; n: number }>>(
    Prisma.sql`SELECT organization_id, source, count(*)::int AS n FROM messages
      WHERE sent_at >= ${start} AND sent_at < ${end}
        AND direction = 'outbound' AND status IN ('sent','delivered','read') AND is_system_message = false
      GROUP BY organization_id, source`,
  );
  const byOrg = new Map<string, DailyOrgCount>();
  for (const r of rows) {
    const entry = byOrg.get(r.organization_id) ?? { organizationId: r.organization_id, billable: 0, bySource: {} };
    const key = r.source ?? "unknown";
    entry.bySource[key] = (entry.bySource[key] ?? 0) + Number(r.n);
    entry.billable += Number(r.n);
    byOrg.set(r.organization_id, entry);
  }
  return [...byOrg.values()];
}

/** Idempotent: upserts the computed rows and removes rows of that day that no longer have any billable message. */
export async function storeDailyUsage(prisma: PrismaClient, day: Date, rows: DailyOrgCount[], now: Date = new Date()): Promise<{ upserted: number; removed: number }> {
  const dayStart = utcDayStart(day);
  return prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.messageUsageDaily.upsert({
        where: { organizationId_day: { organizationId: r.organizationId, day: dayStart } },
        create: { organizationId: r.organizationId, day: dayStart, billableCount: r.billable, bySource: r.bySource, computedAt: now },
        update: { billableCount: r.billable, bySource: r.bySource, computedAt: now },
      });
    }
    const ids = rows.map((r) => r.organizationId);
    const removed = await tx.messageUsageDaily.deleteMany({
      where: ids.length > 0 ? { day: dayStart, organizationId: { notIn: ids } } : { day: dayStart },
    });
    return { upserted: rows.length, removed: removed.count };
  });
}
