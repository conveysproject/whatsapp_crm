import type { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamPerformance,
} from "../lib/analytics-queries.js";

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const metrics = await getOverviewMetrics(fastify.prisma, organizationId);
    return reply.send({ data: metrics });
  });

  fastify.get("/analytics/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "14", 10);
    const volume = await getConversationVolume(fastify.prisma, organizationId, days);
    return reply.send({ data: volume });
  });

  fastify.get("/analytics/team", async (request, reply) => {
    const { organizationId } = request.auth;
    const performance = await getTeamPerformance(fastify.prisma, organizationId);
    return reply.send({ data: performance });
  });
};
