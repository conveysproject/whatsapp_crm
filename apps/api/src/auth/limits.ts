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
const LOCK_MAX_S = 86400;
const failKey = (accountId: string) => `auth:pwfail:${accountId}`;
const lockKey = (accountId: string) => `auth:lock:${accountId}`;

/** Count a wrong password. From the 5th failure in 15 min the account is locked; each further failure doubles the lock (max 24 h). */
export async function recordPasswordFailure(accountId: string): Promise<void> {
  await redis.set(failKey(accountId), 0, "EX", PWFAIL_WINDOW_S, "NX");
  const n = await redis.incr(failKey(accountId));
  if (n >= PWFAIL_LOCK_AT) {
    const ttl = Math.min(PWFAIL_WINDOW_S * 2 ** (n - PWFAIL_LOCK_AT), LOCK_MAX_S);
    await redis.set(lockKey(accountId), "1", "EX", ttl);
  }
}

export async function clearPasswordFailures(accountId: string): Promise<void> {
  await redis.del(failKey(accountId), lockKey(accountId));
}

export async function isLocked(accountId: string): Promise<boolean> {
  return (await redis.exists(lockKey(accountId))) === 1;
}
