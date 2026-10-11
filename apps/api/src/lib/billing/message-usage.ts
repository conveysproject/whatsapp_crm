import { utcDayKey, utcDayStart } from "./metering.js";

export interface MessageUsageRow {
  day: Date;
  billableCount: number;
  bySource: unknown;
  computedAt: Date;
}

export interface MessageUsageSummary {
  billable: number;
  bySource: Record<string, number>;
  daily: Array<{ day: string; billable: number }>;
  updatedAt: string | null;
}

/** One organization's rollup rows for a UTC month, folded into totals and a continuous daily series up to today. */
export function buildMessageUsage(rows: MessageUsageRow[], from: Date, toExclusive: Date, today: Date): MessageUsageSummary {
  const bySource: Record<string, number> = {};
  const perDay = new Map<string, number>();
  let billable = 0;
  let latest: Date | null = null;

  for (const r of rows) {
    billable += r.billableCount;
    const key = utcDayKey(r.day);
    perDay.set(key, (perDay.get(key) ?? 0) + r.billableCount);
    if (r.bySource && typeof r.bySource === "object" && !Array.isArray(r.bySource)) {
      for (const [k, v] of Object.entries(r.bySource as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) bySource[k] = (bySource[k] ?? 0) + v;
      }
    }
    if (!latest || r.computedAt > latest) latest = r.computedAt;
  }

  const lastDay = new Date(Math.min(toExclusive.getTime() - 86_400_000, utcDayStart(today).getTime()));
  const daily: Array<{ day: string; billable: number }> = [];
  for (let t = from.getTime(); t <= lastDay.getTime(); t += 86_400_000) {
    const key = utcDayKey(new Date(t));
    daily.push({ day: key, billable: perDay.get(key) ?? 0 });
  }

  return { billable, bySource, daily, updatedAt: latest ? latest.toISOString() : null };
}
