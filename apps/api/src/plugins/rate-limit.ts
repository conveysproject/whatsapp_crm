import type { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../lib/queue.js";

export const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    redis: redisConnection,
    keyGenerator: (req) => {
      const auth = (req as unknown as { auth?: { userId?: string } }).auth;
      return auth?.userId ?? req.ip;
    },
    errorResponseBuilder: () => ({
      error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
    }),
  });
};
