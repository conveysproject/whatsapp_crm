import type { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../lib/queue.js";

export const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    // Admin routes: 20 req/min. Bootstrap: 5 req/day (enforced in route).
    // All other routes: 60 req/min.
    max: (req) => (req.url.startsWith("/v1/admin/") ? 20 : 60),
    timeWindow: "1 minute",
    redis: redisConnection,
    keyGenerator: (req) => {
      const auth = (req as unknown as { auth?: { userId?: string } }).auth;
      // Admin routes keyed by IP so an attacker can't bypass by rotating tokens
      if (req.url.startsWith("/v1/admin/")) return `admin:${req.ip}`;
      return auth?.userId ?? req.ip;
    },
    errorResponseBuilder: () => ({
      error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
    }),
  });
};
