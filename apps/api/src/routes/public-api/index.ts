import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../../lib/queue.js";
import { newApiId } from "../../lib/public-api/responses.js";
import { publicApiAuth } from "./auth.js";
import { publicApiMessagesRouter } from "./messages.js";

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
  if (status === 429) return reply.status(429).send({ api_id: newApiId(), error: "Request was throttled." });
  if (typeof status === "number" && status >= 400 && status < 500) {
    // Client errors (malformed JSON, payload too large, ...): safe, generic message only.
    const message = status === 413 ? "Request body is too large" : "Invalid request";
    return reply.status(status).send({ api_id: newApiId(), error: message });
  }
  request.log.error({ err: error }, "public API unhandled error");
  return reply.status(500).send({ api_id: newApiId(), error: "Internal server error" });
}

const throttled = () => ({ statusCode: 429, api_id: newApiId(), error: "Request was throttled." });

/**
 * Registered at prefix `/v1/Account/:authId`. Encapsulated: the rate limiters, auth hook and error handler apply only to these routes.
 * Note: when Redis is down the limiters fail closed (the request errors and is answered with a masked 500).
 */
export const publicApiRouter: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(publicApiErrorHandler);

  const perCredentialMax = positiveIntEnv("PUBLIC_API_RATE_LIMIT", 300);
  const preAuthMax = positiveIntEnv("PUBLIC_API_PREAUTH_RATE_LIMIT", perCredentialMax * 10);

  // Coarse PRE-AUTH flood guard, keyed by IP only. The API is not built with `trustProxy`, so behind a reverse proxy
  // `req.ip` is the proxy address and this degrades to ONE global bucket - which is why its max is high (10x) and why
  // the per-credential limiter below is the authoritative one. It must not be keyed by authId: unauthenticated
  // requests would then let a third party exhaust a victim's bucket.
  await fastify.register(rateLimit, {
    max: preAuthMax,
    timeWindow: "1 minute",
    ...(redisConnection ? { redis: redisConnection } : {}),
    keyGenerator: (req) => `pub:ip:${req.ip}`,
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
  });
};
