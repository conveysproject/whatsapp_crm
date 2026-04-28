import type { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamPerformance,
} from "../lib/analytics-queries.js";
import { cacheGet, cacheSet, orgKey } from "../lib/cache.js";

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:overview");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const metrics = await getOverviewMetrics(fastify.prisma, organizationId);
    await cacheSet(key, metrics, 120);
    return reply.send({ data: metrics });
  });

  fastify.get("/analytics/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "14", 10);
    const key = orgKey(organizationId, `analytics:conversations:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const volume = await getConversationVolume(fastify.prisma, organizationId, days);
    await cacheSet(key, volume, 120);
    return reply.send({ data: volume });
  });

  fastify.get("/analytics/team", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:team");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const performance = await getTeamPerformance(fastify.prisma, organizationId);
    await cacheSet(key, performance, 120);
    return reply.send({ data: performance });
  });
};
