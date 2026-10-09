import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../../lib/queue.js";
import { clientIp } from "../../lib/public-api/client-ip.js";
import { plivoErrorBody } from "../../lib/public-api/responses.js";
import { safeErr } from "../../lib/public-api/safe-err.js";
import { recordApiRequest } from "../../lib/public-api/usage.js";
import { publicApiAuth } from "./auth.js";
import { publicApiMessagesRouter } from "./messages.js";
import { publicApiTemplatesRouter } from "./templates.js";

/** Positive integer from an env var; falls back when missing, empty, non-numeric, zero or negative. */
export function positiveIntEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Plivo-style bodies for errors raised outside `plivoError` (rate limit, body parsing, unexpected failures).
 * Tolerates a non-Error / null throw and never throws itself.
 */
export function publicApiErrorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const status = (error as { statusCode?: number } | null | undefined)?.statusCode;
  if (status === 429) return reply.status(429).send(plivoErrorBody("Request was throttled."));
  if (typeof status === "number" && status >= 400 && status < 500) {
    // Client errors (malformed JSON, payload too large, ...): safe, generic message only.
    const message = status === 413 ? "Request body is too large" : "Invalid request";
    return reply.status(status).send(plivoErrorBody(message));
  }
  // Name/code and request id only: error messages (e.g. Prisma validation errors) can echo phone numbers and text.
  request.log.error({ error: safeErr(error), reqId: request.id }, "public API unhandled error");
  return reply.status(500).send(plivoErrorBody("Internal server error"));
}

/** Records one usage event for a finished response. Never throws (the hook must not affect a response). */
export function recordUsageOnResponse(request: FastifyRequest, reply: FastifyReply): void {
  try {
    const who = request.publicApi ?? request.publicApiAttempt;
    recordApiRequest({
      method: request.method,
      routeUrl: request.routeOptions?.url,
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Math.round(reply.elapsedTime)) || 0,
      requestId: String(request.id),
      messages: request.usageMessages ?? 0,
      organizationId: who?.organizationId ?? null,
      apiKeyId: who?.apiKeyId ?? null,
    });
  } catch { /* usage recording must never affect a response */ }
}

const throttled = () => ({ statusCode: 429, ...plivoErrorBody("Request was throttled.") });

/**
 * Registered at prefix `/v1/Account/:authId`. Encapsulated: the rate limiters, auth hook and error handler apply only to these routes.
 * Note: when Redis is down the limiters do NOT fail fast: the shared ioredis client is built with
 * `maxRetriesPerRequest: null` (lib/queue.ts), so limiter calls (and `queue.add` in the routes) wait until the client
 * reconnects or the request times out upstream, rather than erroring into a 500.
 */
export const publicApiRouter: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(publicApiErrorHandler);

  // One id per request: used in every response body and (logging plan) as the request-log row id.
  fastify.addHook("onRequest", (req, _reply, done) => { req.apiId = randomUUID(); done(); });

  // Usage metering: exactly one event per response of this plugin (incl. 4xx/5xx/429). Synchronous, in-memory, never throws.
  // The route PATTERN is recorded (never the URL, which carries the auth id and message ids).
  // Known limitation: Fastify does not fire onResponse for requests aborted by the client, so those are not counted.
  fastify.addHook("onResponse", (request, reply, done) => {
    recordUsageOnResponse(request, reply);
    done();
  });

  const perCredentialMax = positiveIntEnv("PUBLIC_API_RATE_LIMIT", 300);
  const preAuthMax = positiveIntEnv("PUBLIC_API_PREAUTH_RATE_LIMIT", perCredentialMax * 10);

  // Coarse PRE-AUTH flood guard, keyed by the client IP only. The API is not built with `trustProxy`, so behind
  // Railway `req.ip` is the proxy address; `clientIp` reads the real address from X-Forwarded-For (right-most public
  // entry, only when the socket peer is our own proxy) so spoofed headers cannot choose a bucket. The max stays high
  // (10x) because shared NATs exist, and the per-credential limiter below is the authoritative one. It must not be
  // keyed by authId: unauthenticated requests would then let a third party exhaust a victim's bucket.
  let probesLeft = 20;
  fastify.addHook("onRequest", (req, _reply, done) => {
    // One-off deployment probe (no addresses): confirms the proxy header shape without logging anyone's IP.
    if (probesLeft > 0) {
      probesLeft--;
      const xff = req.headers["x-forwarded-for"];
      const entries = (Array.isArray(xff) ? xff.join(",") : xff ?? "").split(",").filter((e) => e.trim()).length;
      req.log.info({ xffEntries: entries, hasRealIp: Boolean(req.headers["x-real-ip"]), resolvedIsPeer: clientIp(req.ip, xff, req.headers["x-real-ip"]) === req.ip }, "[public-api] client-ip probe");
    }
    done();
  });
  await fastify.register(rateLimit, {
    max: preAuthMax,
    timeWindow: "1 minute",
    ...(redisConnection ? { redis: redisConnection } : {}),
    keyGenerator: (req) => `pub:ip:${clientIp(req.ip, req.headers["x-forwarded-for"], req.headers["x-real-ip"])}`,
    errorResponseBuilder: throttled,
  });
  fastify.addHook("preHandler", (req, reply) => publicApiAuth(req as never, reply));

  // Child context created AFTER the auth hook: its preHandler limiter runs after `publicApiAuth` (parent hooks run
  // before route-level hooks), so only authenticated requests count, per API key.
  await fastify.register(async (child) => {
    await child.register(rateLimit, {
      hook: "preHandler",
      max: perCredentialMax,
      timeWindow: "1 minute",
      ...(redisConnection ? { redis: redisConnection } : {}),
      keyGenerator: (req) => `pub:key:${(req as { publicApi?: { apiKeyId?: string } }).publicApi?.apiKeyId ?? ""}`,
      errorResponseBuilder: throttled,
    });
    await child.register(publicApiMessagesRouter);
    await child.register(publicApiTemplatesRouter);
  });
};
