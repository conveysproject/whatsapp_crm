import type { FastifyPluginAsync } from "fastify";
import { INTERNAL_ORG_NAMES } from "../lib/billing/internal-orgs.js";
import { parseMonth } from "../lib/billing/metering.js";
import { parseCycleKey } from "../lib/billing/cycle.js";
import { generateStatements, issueStatements, setStatementStatus } from "../lib/billing/statements.js";
import { ensurePaymentLinks } from "../lib/billing/statement-payment.js";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: "Super admin access required" } };

/**
 * Super-admin only. Lists and (re)generates DRAFT statements. There is deliberately no issue or charge action here.
 * Statements belong to each customer's own billing cycle (starting on their registration day); the list filters by the
 * calendar month in which cycles started, and generation takes the boundary day on which cycles ended.
 */
export const adminBillingStatementsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { month?: string; includeInternal?: string } }>("/admin/billing/statements", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const month = request.query.month ?? "";
    if (!parseMonth(month)) {
      return reply.status(400).send({ error: { code: "INVALID_MONTH", message: "month is required in YYYY-MM format" } });
    }
    const rows = await fastify.prisma.billingStatement.findMany({
      where: { month: { startsWith: `${month}-` } },
      select: { organizationId: true, month: true, messages: true, bandName: true, amountInr: true, amountUsd: true, status: true },
      orderBy: { messages: "desc" },
      take: 1000,
    });
    const orgs = rows.length > 0
      ? await fastify.prisma.organization.findMany({ where: { id: { in: rows.map((r) => r.organizationId) } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(orgs.map((o) => [o.id, o.name]));
    const includeInternal = request.query.includeInternal === "true";
    const data = rows
      .map((r) => ({ ...r, name: nameById.get(r.organizationId) ?? "(deleted organization)" }))
      .filter((r) => includeInternal || !INTERNAL_ORG_NAMES.includes(r.name));
    const totalInr = data.reduce((s, r) => s + (r.amountInr ?? 0), 0);
    const totalUsd = data.reduce((s, r) => s + (r.amountUsd ?? 0), 0);
    return reply.send({ data: { month, totals: { statements: data.length, inr: totalInr, usd: totalUsd }, statements: data } });
  });

  fastify.post<{ Body: { date?: unknown } }>("/admin/billing/statements/generate", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const day = typeof request.body?.date === "string" ? parseCycleKey(request.body.date) : null;
    if (!day) {
      return reply.status(400).send({ error: { code: "INVALID_DATE", message: "date is required in YYYY-MM-DD format" } });
    }
    try {
      return reply.send({ data: await generateStatements(fastify.prisma, day) });
    } catch (err) {
      if (err instanceof Error && err.message === "day has not arrived") {
        return reply.status(400).send({ error: { code: "DATE_NOT_ARRIVED", message: "Statements can only be prepared for cycles that have ended" } });
      }
      throw err;
    }
  });

  // Issues drafts whose cycle started on/after the owner's charging start date. Collects no money.
  fastify.post("/admin/billing/statements/issue", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const res = await issueStatements(fastify.prisma);
    if (!res.configured) {
      return reply.status(409).send({ error: { code: "CHARGING_NOT_CONFIGURED", message: "Set a charging start date in the prices settings first" } });
    }
    // Payment links are created (and emailed) right away; any that fail are retried by the daily job.
    const links = await ensurePaymentLinks(fastify.prisma);
    return reply.send({ data: { ...res, paymentLinks: links } });
  });

  fastify.post<{ Body: { organizationId?: unknown; month?: unknown; status?: unknown } }>("/admin/billing/statements/status", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const { organizationId, month, status } = request.body ?? {};
    if (typeof organizationId !== "string" || organizationId.length === 0 || typeof month !== "string" || !parseCycleKey(month) || (status !== "paid" && status !== "void")) {
      return reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "organizationId, month (YYYY-MM-DD) and status (paid or void) are required" } });
    }
    const ok = await setStatementStatus(fastify.prisma, organizationId, month, status);
    if (!ok) return reply.status(409).send({ error: { code: "INVALID_TRANSITION", message: "Only an issued statement can be marked paid; only a draft or issued one can be voided" } });
    return reply.send({ data: { organizationId, month, status } });
  });
};
