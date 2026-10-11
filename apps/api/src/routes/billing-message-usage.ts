import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { parseMonth } from "../lib/billing/metering.js";
import { buildMessageUsage } from "../lib/billing/message-usage.js";

function currentMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const billingMessageUsageRouter: FastifyPluginAsync = async (fastify) => {
  // The caller's own organization's billable outbound message count for a UTC month (default: this month).
  // Counts only: no message content or contact data. Fed by the hourly/nightly message_usage_daily rollup.
  fastify.get<{ Querystring: { month?: string | string[] } }>("/billing/message-usage", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_billing permission required" } });
    }
    const now = new Date();
    const raw = request.query.month;
    const monthStr = raw === undefined ? currentMonth(now) : typeof raw === "string" ? raw : "";
    const range = parseMonth(monthStr);
    if (!range) {
      return reply.status(400).send({ error: { code: "INVALID_MONTH", message: "month must be in YYYY-MM format" } });
    }

    const rows = await fastify.prisma.messageUsageDaily.findMany({
      where: { organizationId, day: { gte: range.from, lt: range.toExclusive } },
      select: { day: true, billableCount: true, bySource: true, computedAt: true },
      orderBy: { day: "asc" },
    });

    return {
      data: {
        month: monthStr,
        from: range.from.toISOString(),
        toExclusive: range.toExclusive.toISOString(),
        ...buildMessageUsage(rows, range.from, range.toExclusive, now),
      },
    };
  });
};
