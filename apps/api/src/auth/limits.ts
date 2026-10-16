import { redis } from "../lib/redis.js";

/** Fixed-window counter. Returns true when the caller is over the limit. */
export async function hitLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const n = await redis.incr(key);
  await redis.expire(key, windowSec, "NX");
  return n > max;
}
