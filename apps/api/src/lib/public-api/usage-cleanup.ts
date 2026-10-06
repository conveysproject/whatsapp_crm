import type { PrismaClient } from "@prisma/client";

export const DELETE_BATCH = 5000;
/** Time budget of one cleanup run (it shares a single-concurrency queue with the 5-minute recover-stuck job). */
export const CLEANUP_BUDGET_MS = 60_000;
const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 2;

/**
 * API_REQUEST_LOG_RETENTION_DAYS as an integer >= 2: missing, non-numeric, zero or negative values fall back to 30; 1 is
 * raised to 2 (a day boundary must never delete the rows the hourly dashboard view still needs).
 */
export function retentionDays(): number {
  const n = Number.parseInt(process.env["API_REQUEST_LOG_RETENTION_DAYS"] ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, n);
}

/**
 * Deletes raw request-log rows older than the retention, DELETE_BATCH rows per statement so no long lock is held.
 * Runs batches until one deletes fewer than DELETE_BATCH rows or the time budget is spent (the next hourly run continues).
 * Rollups (api_usage_daily) are never touched. Returns the number of rows deleted.
 */
export async function cleanupApiRequestLogs(
  prisma: PrismaClient,
  now: Date = new Date(),
  budgetMs: number = CLEANUP_BUDGET_MS,
  clock: () => number = Date.now
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays() * 86_400_000);
  const startedAt = clock();
  let total = 0;
  do {
    const deleted = Number(await prisma.$executeRaw`
      DELETE FROM api_request_logs
      WHERE id IN (SELECT id FROM api_request_logs WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH})`);
    total += deleted;
    if (deleted < DELETE_BATCH) break;
  } while (clock() - startedAt < budgetMs);
  return total;
}
