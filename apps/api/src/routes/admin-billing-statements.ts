import type { FastifyPluginAsync } from "fastify";
import { INTERNAL_ORG_NAMES } from "../lib/billing/internal-orgs.js";
import { parseMonth } from "../lib/billing/metering.js";
import { generateStatements } from "../lib/billing/statements.js";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: "Super admin access required" } };
const BAD_MONTH = { error: { code: "INVALID_MONTH", message: "month is required in YYYY-MM format" } };

/** Super-admin only. Lists and (re)generates DRAFT statements. There is deliberately no issue or charge action here. */
export const adminBillingStatementsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { month?: string; includeInternal?: string } }>("/admin/billing/statements", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const month = request.query.month ?? "";
    if (!parseMonth(month)) return reply.status(400).send(BAD_MONTH);
    const rows = await fastify.prisma.billingStatement.findMany({
      where: { month },
      select: { organizationId: true, messages: true, bandName: true, amountInr: true, amountUsd: true, status: true },
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

  fastify.post<{ Body: { month?: unknown } }>("/admin/billing/statements/generate", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const month = typeof request.body?.month === "string" ? request.body.month : "";
    if (!parseMonth(month)) return reply.status(400).send(BAD_MONTH);
    try {
      return reply.send({ data: await generateStatements(fastify.prisma, month) });
    } catch (err) {
      if (err instanceof Error && err.message === "month has not finished") {
        return reply.status(400).send({ error: { code: "MONTH_NOT_FINISHED", message: "Statements can only be prepared for a finished month" } });
      }
      throw err;
    }
  });
};
