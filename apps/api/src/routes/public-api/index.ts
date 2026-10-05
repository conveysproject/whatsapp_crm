import type { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../../lib/queue.js";
import { newApiId } from "../../lib/public-api/responses.js";
import { publicApiAuth } from "./auth.js";
import { publicApiMessagesRouter } from "./messages.js";

/** Registered at prefix `/v1/Account/:authId`. Encapsulated: the rate limiter, auth hook and error handler apply only to these routes. */
export const publicApiRouter: FastifyPluginAsync = async (fastify) => {
  // Plivo-style bodies for errors raised outside `plivoError` (rate limit, body parsing, unexpected failures).
  fastify.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ api_id: newApiId(), error: "Request was throttled." });
    if (typeof status === "number" && status >= 400 && status < 500) {
      // Client errors (malformed JSON, payload too large, ...): safe, generic message only.
      const message = status === 413 ? "Request body is too large" : "Invalid request";
      return reply.status(status).send({ api_id: newApiId(), error: message });
    }
    request.log.error({ err: error }, "public API unhandled error");
    return reply.status(500).send({ api_id: newApiId(), error: "Internal server error" });
  });

  await fastify.register(rateLimit, {
    max: () => Number(process.env["PUBLIC_API_RATE_LIMIT"] ?? 300),
    timeWindow: "1 minute",
    ...(redisConnection ? { redis: redisConnection } : {}),
    // Keyed by client IP AND credential id so a third party cannot exhaust a victim's bucket by guessing the id.
    keyGenerator: (req) => `pub:${req.ip}:${(req.params as { authId?: string }).authId ?? ""}`,
    errorResponseBuilder: () => ({ statusCode: 429, api_id: newApiId(), error: "Request was throttled." }),
  });
  fastify.addHook("preHandler", (req, reply) => publicApiAuth(req as never, reply));
  await fastify.register(publicApiMessagesRouter);
};
