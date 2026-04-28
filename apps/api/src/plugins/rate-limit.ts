import type { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../lib/queue.js";

export const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    redis: redisConnection,
    keyGenerator: (req) => {
      const auth = (req as unknown as { auth?: { organizationId?: string } }).auth;
      return auth?.organizationId ?? req.ip;
    },
    errorResponseBuilder: () => ({
      error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
    }),
  });
};
