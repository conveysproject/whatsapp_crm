import type { PrismaClient } from "@prisma/client";
import { computeDailyUsage, storeDailyUsage, utcDayStart, utcDayKey } from "./metering.js";

/** Recompute the UTC days from (today - lookbackDays) to today, oldest first. A failing day is logged (name only) and skipped; the next run retries it. */
export async function runMeteringSweep(prisma: PrismaClient, now: Date = new Date(), lookbackDays = 1): Promise<{ days: string[]; upserted: number; removed: number }> {
  const today = utcDayStart(now);
  const days: Date[] = [];
  for (let i = lookbackDays; i >= 0; i--) days.push(new Date(today.getTime() - i * 86_400_000));
  const done: string[] = [];
  let upserted = 0;
  let removed = 0;
  for (const day of days) {
    try {
      const rows = await computeDailyUsage(prisma, day);
      const res = await storeDailyUsage(prisma, day, rows, now);
      upserted += res.upserted;
      removed += res.removed;
      done.push(utcDayKey(day));
    } catch (err) {
      console.warn("[billing-metering] day failed", utcDayKey(day), err instanceof Error ? err.name : "error");
    }
  }
  return { days: done, upserted, removed };
}
