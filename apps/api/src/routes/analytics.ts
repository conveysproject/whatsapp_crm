import type { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamStats,
  getMyWork,
  getCampaignSnapshot,
  getActivityFeed,
  getAgentDetail,
  getCampaignAnalytics,
  getConversationStatusBreakdown,
} from "../lib/analytics-queries.js";
import { cacheGet, cacheSet, orgKey } from "../lib/cache.js";
import { canAccess, canAccessSub } from "../lib/permissions.js";

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  // Section gate (Phase 2 / D15): every analytics route requires analytics_access.
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccess(role, permissions, "analytics_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "analytics_access permission required" } });
    }
  });

  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:overview:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const metrics = await getOverviewMetrics(fastify.prisma, organizationId, days);
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
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "analytics_access", "analytics_agent_performance")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "analytics_agent_performance permission required" } });
    }
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:team:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const stats = await getTeamStats(fastify.prisma, organizationId, days);
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

  fastify.get("/analytics/agent/:id", async (request, reply) => {
    const { organizationId, userId, role } = request.auth;
    const params = request.params as { id: string };
    // Agents may only view their own stats; managers and admins see any agent
    if ((role === "agent" || role === "viewer") && params.id !== userId) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Agents can only view their own analytics" } });
    }
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:agent:${params.id}:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getAgentDetail(fastify.prisma, organizationId, params.id, days);
    await cacheSet(key, data, 60);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:campaigns:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getCampaignAnalytics(fastify.prisma, organizationId, days);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/conversation-status", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "30", 10);
    const key = orgKey(organizationId, `analytics:conv-status:${days}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });
    const data = await getConversationStatusBreakdown(fastify.prisma, organizationId, days);
    await cacheSet(key, data, 120);
    return reply.send({ data: data });
  });

  fastify.get("/analytics/export", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    const query = request.query as Record<string, string>;
    const tab = query["tab"] ?? "overview";
    if (!canAccessSub(role, permissions, "analytics_access", "analytics_export")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "analytics_export permission required" } });
    }
    const days = parseInt(query["days"] ?? "30", 10);
    const filename = `analytics-${tab}-${days}d.csv`;

    let csv = "";

    if (tab === "overview") {
      const metrics = await getOverviewMetrics(fastify.prisma, organizationId, days);
      csv = "metric,value\n";
      csv += `open_conversations,${metrics.openConversations}\n`;
      csv += `total_contacts,${metrics.totalContacts}\n`;
      csv += `messages_today,${metrics.messagesToday}\n`;
      csv += `campaigns_this_month,${metrics.campaignsSentThisMonth}\n`;
      csv += `avg_first_response_secs,${metrics.avgFirstResponseTime}\n`;
      csv += `bot_conversations,${metrics.botConversations}\n`;
    } else if (tab === "conversations") {
      const volume = await getConversationVolume(fastify.prisma, organizationId, days);
      csv = "date,inbound,outbound\n";
      csv += volume.map((r) => `${r.date},${r.inbound},${r.outbound}`).join("\n");
    } else if (tab === "team") {
      const stats = await getTeamStats(fastify.prisma, organizationId, days);
      csv = "agent,open_conversations,resolved_today,avg_first_response_secs,sla_breaches\n";
      csv += stats
        .map((r) => `"${r.displayName}",${r.openConversations},${r.resolvedToday},${r.avgFirstResponseSecs},${r.slaBreaches}`)
        .join("\n");
    } else if (tab === "campaigns") {
      const camps = await getCampaignAnalytics(fastify.prisma, organizationId, days);
      csv = "name,sent_at,total_sent,delivered,read,failed,delivery_rate,read_rate\n";
      csv += camps
        .map((r) => `"${r.name}",${r.sentAt},${r.totalSent},${r.delivered},${r.read},${r.failed},${r.deliveryRate},${r.readRate}`)
        .join("\n");
    } else {
      return reply.status(400).send({ error: "Invalid tab. Must be one of: overview, conversations, team, campaigns" });
    }

    void reply.header("Content-Type", "text/csv");
    void reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(csv);
  });
};
