import type { FastifyPluginAsync } from "fastify";
import { parseMonth, percentile, bucketOf } from "../lib/billing/metering.js";
import { INTERNAL_ORG_NAMES } from "../lib/billing/internal-orgs.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface OrgAgg { organizationId: string; billable: number; bySource: Record<string, number> }

export const adminBillingRouter: FastifyPluginAsync = async (fastify) => {
  // Monthly billable outbound message usage per organization (super-admin only, counts only).
  fastify.get<{ Querystring: { month?: string; limit?: string; includeInternal?: string } }>(
    "/admin/billing/usage",
    async (request, reply) => {
      if (request.auth.role !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
      }
      const monthStr = request.query.month ?? "";
      const range = parseMonth(monthStr);
      if (!range) {
        return reply.status(400).send({ error: { code: "INVALID_MONTH", message: "month is required in YYYY-MM format" } });
      }
      let limit = DEFAULT_LIMIT;
      if (request.query.limit !== undefined) {
        if (!/^\d+$/.test(request.query.limit)) {
          return reply.status(400).send({ error: { code: "INVALID_LIMIT", message: `limit must be an integer between 1 and ${MAX_LIMIT}` } });
        }
        limit = Number(request.query.limit);
        if (limit < 1 || limit > MAX_LIMIT) {
          return reply.status(400).send({ error: { code: "INVALID_LIMIT", message: `limit must be an integer between 1 and ${MAX_LIMIT}` } });
        }
      }
      const includeInternal = request.query.includeInternal === "true";

      const rows = await fastify.prisma.messageUsageDaily.findMany({
        where: { day: { gte: range.from, lt: range.toExclusive } },
        select: { organizationId: true, billableCount: true, bySource: true },
      });

      const byOrg = new Map<string, OrgAgg>();
      for (const r of rows) {
        const agg = byOrg.get(r.organizationId) ?? { organizationId: r.organizationId, billable: 0, bySource: {} };
        agg.billable += r.billableCount;
        const src = r.bySource;
        if (src && typeof src === "object" && !Array.isArray(src)) {
          for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
            if (typeof v === "number" && Number.isFinite(v)) agg.bySource[k] = (agg.bySource[k] ?? 0) + v;
          }
        }
        byOrg.set(r.organizationId, agg);
      }

      const ids = [...byOrg.keys()];
      const orgs = ids.length > 0
        ? await fastify.prisma.organization.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, planTier: true },
          })
        : [];
      const orgById = new Map(orgs.map((o) => [o.id, o]));

      const all = [...byOrg.values()]
        .map((a) => {
          const o = orgById.get(a.organizationId);
          return {
            organizationId: a.organizationId,
            name: o ? o.name : "(deleted organization)",
            planTier: o ? String(o.planTier) : "unknown",
            billable: a.billable,
            bySource: a.bySource,
          };
        })
        .filter((o) => includeInternal || !INTERNAL_ORG_NAMES.includes(o.name))
        .sort((x, y) => y.billable - x.billable || (x.organizationId < y.organizationId ? -1 : x.organizationId > y.organizationId ? 1 : 0));

      const sortedAsc = all.map((o) => o.billable).sort((a, b) => a - b);
      const buckets: Record<string, number> = {};
      for (const o of all) {
        const b = bucketOf(o.billable);
        buckets[b] = (buckets[b] ?? 0) + 1;
      }

      return reply.send({
        data: {
          month: monthStr,
          from: range.from.toISOString(),
          toExclusive: range.toExclusive.toISOString(),
          totals: { organizations: all.length, billable: all.reduce((s, o) => s + o.billable, 0) },
          percentiles: {
            p50: percentile(sortedAsc, 50),
            p90: percentile(sortedAsc, 90),
            p99: percentile(sortedAsc, 99),
            max: sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1]! : 0,
          },
          buckets,
          organizations: all.slice(0, limit),
        },
      });
    },
  );
};
