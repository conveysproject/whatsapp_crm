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
import { parseRange, isValidTz, windowFor } from "../lib/dashboard-range.js";
import { getDashboardKpis, getAttentionCounts, getCampaignFunnel, type AttentionKey } from "../lib/dashboard-queries.js";
import { checkPlanLimit } from "../lib/plan-limits.js";

// Clamp the client-supplied window to 1..90 days; non-numeric falls back to the endpoint default.
function clampDays(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? String(fallback), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(90, Math.max(1, n));
}

type Severity = "critical" | "warning";
interface AttentionItem { key: string; severity: Severity; count: number; label: string; href: string }

// Same limit entities and gate semantics as GET /billing/usage (checkPlanLimit).
const PLAN_ENTITIES = ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const;

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  // Section gate (Phase 2 / D15): every analytics route requires analytics_access.
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccess(role, permissions, "analytics_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "analytics_access permission required" } });
    }
  });

  fastify.get("/analytics/dashboard", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    const query = request.query as Record<string, string | undefined>;
    const range = parseRange(query["range"] ?? "7d");
    if (!range) {
      return reply.status(400).send({ error: { code: "INVALID_RANGE", message: "range must be today, 7d or 30d" } });
    }
    const tz = query["tz"] ?? "UTC";
    if (!isValidTz(tz)) {
      return reply.status(400).send({ error: { code: "INVALID_TZ", message: "tz must be a valid IANA timezone" } });
    }

    // Each attention item and the funnel require the permission of the area they link to.
    const canInbox = canAccess(role, permissions, "inbox_access");
    const canTemplates = canAccess(role, permissions, "templates_access");
    const canCampaigns = canAccess(role, permissions, "campaigns_access");
    const canBilling = canAccessSub(role, permissions, "settings_access", "settings_billing");
    const allowed = [
      canInbox && "inbox",
      canTemplates && "templates",
      canCampaigns && "campaigns",
      canBilling && "billing",
    ].filter(Boolean) as string[];
    const permSig = allowed.sort().join(",");

    const key = orgKey(organizationId, `analytics:dashboard:${range}:${tz}:${permSig}`);
    const cached = await cacheGet(key);
    if (cached) return reply.send({ data: cached });

    const now = new Date();
    const w = windowFor(range, tz, now);
    const want = new Set<AttentionKey>();
    if (canInbox) { want.add("unanswered"); want.add("sla_at_risk"); want.add("failed_messages"); }
    if (canTemplates) want.add("templates");

    const [kpis, counts, org, funnel, plan] = await Promise.all([
      getDashboardKpis(fastify.prisma, organizationId, w),
      getAttentionCounts(fastify.prisma, organizationId, now, want),
      // Same source as GET /onboarding/status wabaConnected.
      fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { wabaAccessToken: true } }),
      canCampaigns ? getCampaignFunnel(fastify.prisma, organizationId) : Promise.resolve(null),
      canBilling
        ? Promise.all(PLAN_ENTITIES.map((e) => checkPlanLimit(fastify.prisma, organizationId, e)))
        : Promise.resolve(null),
    ]);

    const attention: AttentionItem[] = [];
    if (!org?.wabaAccessToken) {
      attention.push({ key: "whatsapp_disconnected", severity: "critical", count: 1, label: "WhatsApp is disconnected", href: "/settings/whatsapp-account" });
    }
    if (want.has("unanswered") && counts.unanswered > 0) attention.push({ key: "unanswered", severity: "warning", count: counts.unanswered, label: "Unanswered chats", href: "/inbox" });
    if (want.has("sla_at_risk") && counts.sla_at_risk > 0) attention.push({ key: "sla_at_risk", severity: "critical", count: counts.sla_at_risk, label: "SLA at risk", href: "/inbox" });
    if (want.has("failed_messages") && counts.failed_messages > 0) attention.push({ key: "failed_messages", severity: "warning", count: counts.failed_messages, label: "Failed messages (24h)", href: "/messages" });
    if (want.has("templates") && counts.templates > 0) attention.push({ key: "templates", severity: "warning", count: counts.templates, label: "Templates need attention", href: "/templates" });
    if (plan) {
      const blocked = plan.filter((g) => !g.allowed).length;
      const near = plan.filter((g) => g.allowed && g.limit > 0 && g.current / g.limit >= 0.8).length;
      if (blocked + near > 0) {
        attention.push({
          key: "plan_usage",
          severity: blocked > 0 ? "critical" : "warning",
          count: blocked + near,
          label: blocked > 0 ? "Plan limit reached" : "Plan limit nearly reached",
          href: "/settings/billing",
        });
      }
    }

    const data = {
      range,
      tz,
      generatedAt: now.toISOString(),
      attention,
      kpis,
      campaignFunnel: funnel,
    };
    await cacheSet(key, data, 60);
    return reply.send({ data });
  });

  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = clampDays(query["days"], 30);
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
    const days = clampDays(query["days"], 14);
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
    const days = clampDays(query["days"], 30);
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
    const days = clampDays(query["days"], 30);
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
    const days = clampDays(query["days"], 30);
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
    const days = clampDays(query["days"], 30);
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
    const days = clampDays(query["days"], 30);
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
