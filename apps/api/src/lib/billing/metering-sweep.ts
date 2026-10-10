import type { PrismaClient } from "@prisma/client";
import { computeDailyUsage, storeDailyUsage, utcDayStart, utcDayKey } from "./metering.js";

/** Recompute yesterday and today (UTC). A failing day is logged (name only) and skipped; the next run retries it. */
export async function runMeteringSweep(prisma: PrismaClient, now: Date = new Date()): Promise<{ days: string[]; upserted: number; removed: number }> {
  const today = utcDayStart(now);
  const days = [new Date(today.getTime() - 86_400_000), today];
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
