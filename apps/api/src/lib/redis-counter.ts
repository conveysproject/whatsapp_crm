// Fixed-window counter whose increment and expiry are set in ONE Lua script, so a crash or a key that
// expires between two commands can never leave a counter without a TTL (which would block forever).
// The expiry is set on the first hit, and repaired if the key somehow has none.
export const INCR_WITH_TTL =
  "local c = redis.call('INCRBY', KEYS[1], ARGV[1]) if c == tonumber(ARGV[1]) or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end return c";

/** Any ioredis client (lib/redis.ts or the queue connection). */
export interface EvalClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/** Adds `by` (at least 1) to `key` and returns the new total. Errors propagate so callers fail closed. */
export async function incrWithTtl(client: EvalClient, key: string, ttlSeconds: number, by = 1): Promise<number> {
  return Number(await client.eval(INCR_WITH_TTL, 1, key, Math.max(1, by), ttlSeconds));
}
