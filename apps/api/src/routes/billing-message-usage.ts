import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { parseMonth } from "../lib/billing/metering.js";
import { buildMessageUsage } from "../lib/billing/message-usage.js";
import { planFor, projectMonthTotal } from "../lib/billing/bands.js";
import { loadBillingConfig } from "../lib/billing/settings.js";

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

    const summary = buildMessageUsage(rows, range.from, range.toExclusive, now);
    // Prices, band ranges and the bill are included only after the owner has published them (see lib/billing/bands.ts).
    const config = await loadBillingConfig(fastify.prisma);
    const plan = planFor(summary.billable, config);
    // Alerts are a nice-to-have: a failure here must never break the usage numbers.
    const alertRows = await Promise.resolve()
      .then(() => fastify.prisma.billingAlertEvent.findMany({ where: { organizationId, month: monthStr }, select: { kind: true, createdAt: true }, orderBy: { createdAt: "asc" } }))
      .catch(() => []);
    // Only statements the owner has issued are visible to customers; drafts are internal.
    const statements = await Promise.resolve()
      .then(() => fastify.prisma.billingStatement.findMany({
        where: { organizationId, status: "issued" },
        select: { month: true, messages: true, bandName: true, amountInr: true, amountUsd: true, status: true },
        orderBy: { month: "desc" },
        take: 24,
      }))
      .catch(() => []);
    const alerts = alertRows.filter((a) => config.published || a.kind.startsWith("free_")).map((a) => ({ kind: a.kind, at: a.createdAt.toISOString() }));
    const monthOver = now.getTime() >= range.toExclusive.getTime();
    const projectedTotal = monthOver ? summary.billable : projectMonthTotal(summary.billable, summary.daily.length, range.days);
    const projectedPlan = plan.published && projectedTotal !== null ? planFor(projectedTotal, config) : null;

    return {
      data: {
        month: monthStr,
        from: range.from.toISOString(),
        toExclusive: range.toExclusive.toISOString(),
        ...summary,
        plan,
        alerts,
        statements,
        expected: projectedPlan && projectedPlan.published ? { messages: projectedTotal, band: projectedPlan.current } : null,
      },
    };
  });
};
