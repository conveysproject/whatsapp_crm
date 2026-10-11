import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { buildMessageUsage } from "../lib/billing/message-usage.js";
import { planFor, projectMonthTotal } from "../lib/billing/bands.js";
import { loadBillingConfig } from "../lib/billing/settings.js";
import { cycleContaining, parseCycleKey } from "../lib/billing/cycle.js";

export const billingMessageUsageRouter: FastifyPluginAsync = async (fastify) => {
  // The caller's own organization's billable outbound message count for one billing cycle (default: the current one).
  // A cycle starts on the organization's registration day (UTC). Counts only: no message content or contact data.
  // Fed by the hourly/nightly message_usage_daily rollup.
  fastify.get<{ Querystring: { cycle?: string | string[] } }>("/billing/message-usage", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_billing permission required" } });
    }
    const now = new Date();
    const raw = request.query.cycle;
    let at = now;
    if (raw !== undefined) {
      const start = typeof raw === "string" ? parseCycleKey(raw) : null;
      if (!start) {
        return reply.status(400).send({ error: { code: "INVALID_CYCLE", message: "cycle must be a date in YYYY-MM-DD format" } });
      }
      at = start;
    }

    const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { createdAt: true } });
    if (!org) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    }
    const cycle = cycleContaining(org.createdAt, at);

    const rows = await fastify.prisma.messageUsageDaily.findMany({
      where: { organizationId, day: { gte: cycle.start, lt: cycle.endExclusive } },
      select: { day: true, billableCount: true, bySource: true, computedAt: true },
      orderBy: { day: "asc" },
    });

    const summary = buildMessageUsage(rows, cycle.start, cycle.endExclusive, now);
    // Prices, band ranges and the bill are included only after the owner has published them (see lib/billing/bands.ts).
    const config = await loadBillingConfig(fastify.prisma);
    const plan = planFor(summary.billable, config);
    // Alerts are a nice-to-have: a failure here must never break the usage numbers.
    const alertRows = await Promise.resolve()
      .then(() => fastify.prisma.billingAlertEvent.findMany({ where: { organizationId, month: cycle.key }, select: { kind: true, createdAt: true }, orderBy: { createdAt: "asc" } }))
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
    const cycleOver = now.getTime() >= cycle.endExclusive.getTime();
    const projectedTotal = cycleOver ? summary.billable : projectMonthTotal(summary.billable, summary.daily.length, cycle.days);
    const projectedPlan = plan.published && projectedTotal !== null ? planFor(projectedTotal, config) : null;

    return {
      data: {
        month: cycle.key,
        from: cycle.start.toISOString(),
        toExclusive: cycle.endExclusive.toISOString(),
        cycle: { key: cycle.key, from: cycle.start.toISOString(), toExclusive: cycle.endExclusive.toISOString(), days: cycle.days },
        ...summary,
        plan,
        alerts,
        statements,
        expected: projectedPlan && projectedPlan.published ? { messages: projectedTotal, band: projectedPlan.current } : null,
      },
    };
  });
};
