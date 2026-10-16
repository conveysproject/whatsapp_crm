import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";
import { redis } from "../lib/redis.js";
import { clientIp } from "../lib/public-api/client-ip.js";

/** Fixed-window counter. Returns true when the caller is over the limit. */
export async function hitLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  // SET NX EX first so the key can never exist without a TTL (INCR alone would create it bare).
  await redis.set(key, 0, "EX", windowSec, "NX");
  const n = await redis.incr(key);
  return n > max;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Caller IP for /v1/auth/*: trusted BFF-supplied IP when the shared secret matches, else the proxy-aware default. */
export function authClientIp(request: FastifyRequest): string {
  const secret = process.env["AUTH_BFF_SECRET"];
  const presented = header(request, "x-wbmsg-bff");
  const forwarded = header(request, "x-wbmsg-client-ip")?.trim();
  if (secret && secret.length >= 32 && presented && forwarded && isIP(forwarded)) {
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return forwarded;
  }
  return clientIp(request.ip, request.headers["x-forwarded-for"], request.headers["x-real-ip"]);
}

const PWFAIL_WINDOW_S = 900;
const PWFAIL_LOCK_AT = 5;
const LOCK_BASE_S = 900;
const LOCK_MAX_S = 86400;
const failKey = (accountId: string) => `auth:pwfail:${accountId}`;
const strikeKey = (accountId: string) => `auth:pwstrikes:${accountId}`;
const lockKey = (accountId: string) => `auth:lock:${accountId}`;

// Atomic INCR + EXPIRE so a counter can never exist without a TTL.
// ARGV[1] = ttl seconds, ARGV[2] = "1" to refresh the TTL on every increment, else only when created.
const INCR_WITH_TTL = `
local n = redis.call('INCR', KEYS[1])
if n == 1 or ARGV[2] == '1' then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

async function incrWithTtl(key: string, ttlSec: number, refresh: boolean): Promise<number> {
  return Number(await redis.eval(INCR_WITH_TTL, 1, key, String(ttlSec), refresh ? "1" : "0"));
}

/**
 * Count a wrong password. The 5th failure in 15 min applies a lock and one "strike"; strikes persist 24 h
 * so each repeat lock doubles (900 s, 1800 s, ... capped at 24 h). Callers must not record failures while locked.
 */
export async function recordPasswordFailure(accountId: string): Promise<void> {
  const n = await incrWithTtl(failKey(accountId), PWFAIL_WINDOW_S, false);
  if (n < PWFAIL_LOCK_AT) return;
  const strikes = await incrWithTtl(strikeKey(accountId), LOCK_MAX_S, true);
  const ttl = Math.min(LOCK_BASE_S * 2 ** Math.min(strikes - 1, 20), LOCK_MAX_S);
  await redis.set(lockKey(accountId), "1", "EX", ttl);
  await redis.del(failKey(accountId));
}

export async function clearPasswordFailures(accountId: string): Promise<void> {
  await redis.del(failKey(accountId), strikeKey(accountId), lockKey(accountId));
}

export async function isLocked(accountId: string): Promise<boolean> {
  return (await redis.exists(lockKey(accountId))) === 1;
}
