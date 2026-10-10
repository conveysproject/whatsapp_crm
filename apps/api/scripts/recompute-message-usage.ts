/**
 * Recompute the daily message-usage rollup (message_usage_daily) for an inclusive UTC date range.
 *
 * SAFETY: the default is a DRY RUN that writes nothing. Run with --apply ONLY after the owner confirms.
 * The database URL comes from the environment only (DATABASE_PUBLIC_URL, else DATABASE_URL) and is never printed.
 * Output: UTC day keys and counts only (no organization ids, names or message content).
 *
 *   cd apps/api && railway run --service Postgres pnpm tsx scripts/recompute-message-usage.ts --from 2026-10-01 --to 2026-10-10            # dry run
 *   cd apps/api && railway run --service Postgres pnpm tsx scripts/recompute-message-usage.ts --from 2026-10-01 --to 2026-10-10 --apply    # writes
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseMeteringArgs } from "../src/lib/billing/metering-args.js";
import { computeDailyUsage, storeDailyUsage, utcDayKey } from "../src/lib/billing/metering.js";
import { formatApplyLine, formatDryRunLine, type StoredTotal } from "../src/lib/billing/metering-report.js";

/** Stored totals per UTC day for the range. Returns null when the table does not exist yet (migration not deployed). */
async function readStored(prisma: PrismaClient, from: Date, to: Date): Promise<Map<string, number> | null> {
  try {
    const groups = await prisma.messageUsageDaily.groupBy({
      by: ["day"],
      where: { day: { gte: from, lte: to } },
      _sum: { billableCount: true },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [utcDayKey(g.day), g._sum.billableCount ?? 0]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if ((e as { code?: string } | null)?.code === "P2021" || /relation .* does not exist|does not exist in the current database/i.test(msg)) return null;
    throw e;
  }
}

async function main(): Promise<void> {
  const { from, to, apply } = parseMeteringArgs(process.argv.slice(2)); // throws before connecting if args are invalid
  // DATABASE_PUBLIC_URL is the reachable one when run locally via `railway run --service Postgres`.
  const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const stored = await readStored(prisma, from, to);
    const storedFor = (key: string): StoredTotal => (stored === null ? "n/a" : (stored.get(key) ?? null));
    let days = 0;
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
      const rows = await computeDailyUsage(prisma, d);
      if (apply) {
        const { upserted, removed } = await storeDailyUsage(prisma, d, rows);
        console.log(formatApplyLine(utcDayKey(d), upserted, removed, storedFor(utcDayKey(d))));
      } else {
        const billable = rows.reduce((s, r) => s + r.billable, 0);
        console.log(formatDryRunLine(utcDayKey(d), rows.length, billable, storedFor(utcDayKey(d))));
      }
      days++;
    }
    if (!apply) console.log(`DRY RUN: would write ${days} day(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    // Never print DB driver messages: they can embed the connection string.
    const safe = e instanceof Error && /^(Usage:|DATABASE_)/.test(e.message) ? e.message : `recompute failed (${e instanceof Error ? e.name : "error"})`;
    console.error(safe);
    process.exit(1);
  });
}
