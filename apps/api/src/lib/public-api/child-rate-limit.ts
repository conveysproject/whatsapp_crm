import { redisConnection } from "../queue.js";

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
  childOrgId: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const bucket = `pub:keychild:${apiKeyId}:${childOrgId}`;
  const count = await redisConnection.incr(bucket);
  if (count === 1) await redisConnection.expire(bucket, WINDOW_SECONDS);
  if (count <= maxPerWindow()) return { allowed: true, retryAfterSeconds: 0 };
  const ttl = await redisConnection.ttl(bucket);
  if (ttl < 0) await redisConnection.expire(bucket, WINDOW_SECONDS); // never leave a counter without an expiry
  return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
}
