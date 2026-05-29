import type { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamStats,
  getMyWork,
  getCampaignSnapshot,
  getActivityFeed,
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
    const stats = await getTeamStats(fastify.prisma, organizationId);
    await cacheSet(key, stats, 120);
    return reply.send({ data: stats });
  });

  fastify.get("/analytics/my-work", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const key = orgKey(organizationId, `analytics:my-work:${userId}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getMyWork(fastify.prisma, organizationId, userId);
    await cacheSet(key, data, 60);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/campaign-snapshot", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:campaign-snapshot");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getCampaignSnapshot(fastify.prisma, organizationId);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/activity-feed", async (request, reply) => {
    const { organizationId } = request.auth;
    const key = orgKey(organizationId, "analytics:activity-feed");
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getActivityFeed(fastify.prisma, organizationId);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });
};
