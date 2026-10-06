import type { PrismaClient } from "@prisma/client";

export const DELETE_BATCH = 5000;
export const MAX_BATCHES = 200;
const DEFAULT_RETENTION_DAYS = 30;

/** API_REQUEST_LOG_RETENTION_DAYS as a positive integer; falls back to 30 on missing/zero/negative/non-numeric values. */
export function retentionDays(): number {
  const n = Number.parseInt(process.env["API_REQUEST_LOG_RETENTION_DAYS"] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
}

/**
 * Deletes raw request-log rows older than the retention, DELETE_BATCH rows per statement so no long lock is held.
 * Rollups (api_usage_daily) are never touched. Returns the number of rows deleted.
 */
export async function cleanupApiRequestLogs(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays() * 86_400_000);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const deleted = Number(await prisma.$executeRaw`
      DELETE FROM api_request_logs
      WHERE id IN (SELECT id FROM api_request_logs WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH})`);
    total += deleted;
    if (deleted < DELETE_BATCH) break;
  }
  return total;
}
