import type { PrismaClient } from "@prisma/client";
import { CLEANUP_BUDGET_MS, DELETE_BATCH } from "./usage-cleanup.js";

const DEFAULT_DAYS = 365;
const MIN_DAYS = 90; // owner requirement: keep at least 3 months

/**
 * API_PAYLOAD_RETENTION_DAYS as an integer >= 90 (parseInt semantics: "1.5" -> 1 -> raised to 90). Missing, non-numeric, zero or
 * negative values fall back to 365. Independent of API_REQUEST_LOG_RETENTION_DAYS (raw request logs keep their own, shorter window).
 */
export function payloadRetentionDays(): number {
  const n = Number.parseInt(process.env["API_PAYLOAD_RETENTION_DAYS"] ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.max(MIN_DAYS, n);
}

/**
 * Batched deletes (DELETE_BATCH rows per statement) of payload and callback-attempt rows past the retention, `created_at <` cutoff
 * only. Each table gets its own half of the time budget so a backlog in the first table can never starve the second; whatever is
 * left is picked up by the next hourly run. Returns rows deleted across both tables.
 */
export async function cleanupApiPayloads(
  prisma: PrismaClient,
  now: Date = new Date(),
  budgetMs: number = CLEANUP_BUDGET_MS,
  clock: () => number = Date.now
): Promise<number> {
  const cutoff = new Date(now.getTime() - payloadRetentionDays() * 86_400_000);
  const sliceMs = budgetMs / 2;
  const step = async (table: "payloads" | "attempts"): Promise<number> =>
    Number(
      table === "payloads"
        ? await prisma.$executeRaw`DELETE FROM api_request_payloads WHERE id IN (SELECT id FROM api_request_payloads WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH})`
        : await prisma.$executeRaw`DELETE FROM api_callback_attempts WHERE id IN (SELECT id FROM api_callback_attempts WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH})`
    );
  let total = 0;
  for (const table of ["payloads", "attempts"] as const) {
    const startedAt = clock();
    do {
      const deleted = await step(table);
      total += deleted;
      if (deleted < DELETE_BATCH) break;
    } while (clock() - startedAt < sliceMs);
  }
  return total;
}
