import { redisConnection } from "../queue.js";
import { incrWithTtl } from "../redis-counter.js";

const WINDOW_SECONDS = 60;

function maxPerWindow(): number {
  const n = Number.parseInt(process.env["PUBLIC_API_CHILD_RATE_LIMIT"] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

/**
 * Per-(key, child) fixed-window limiter for parent-key sends, on top of the existing per-key limiter
 * (which stays the overall cap). One INCR per accepted request; the first hit sets the window expiry.
 */
export async function checkChildSendRate(
  apiKeyId: string,
  childOrgId: string,
  cost = 1
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const bucket = `pub:keychild:${apiKeyId}:${childOrgId}`;
  // Atomic: the counter and its expiry are set in one script, so a crash can never leave a bucket without a TTL.
  const count = await incrWithTtl(redisConnection, bucket, WINDOW_SECONDS, cost);
  if (count <= maxPerWindow()) return { allowed: true, retryAfterSeconds: 0 };
  const ttl = await redisConnection.ttl(bucket);
  return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
}
