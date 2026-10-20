import { redisConnection } from "../queue.js";

const WINDOW_SECONDS = 60;
const INCR_WITH_TTL = "local c = redis.call('INCRBY', KEYS[1], ARGV[1]) if c == tonumber(ARGV[1]) or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end return c";

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
  const count = Number(await redisConnection.eval(INCR_WITH_TTL, 1, bucket, Math.max(1, cost), WINDOW_SECONDS));
  if (count <= maxPerWindow()) return { allowed: true, retryAfterSeconds: 0 };
  const ttl = await redisConnection.ttl(bucket);
  return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
}
