import type { FastifyPluginAsync } from "fastify";
import { approveCancellation, reopenAccount, viewOf } from "../lib/billing/cancellation.js";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: "Super admin access required" } };

/** Super-admin only: cancellation requests to approve or dismiss, and approved cancellations to reactivate. */
export const adminBillingCancellationsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/admin/billing/cancellations", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const rows = await fastify.prisma.billingCancellation.findMany({
      where: { status: { in: ["requested", "approved"] } },
      select: { organizationId: true, status: true, requestedAt: true, approvedAt: true, reason: true },
      orderBy: { requestedAt: "desc" },
      take: 200,
    });
    const orgs = rows.length > 0 ? await fastify.prisma.organization.findMany({ where: { id: { in: rows.map((r) => r.organizationId) } }, select: { id: true, name: true } }) : [];
    const name = new Map(orgs.map((o) => [o.id, o.name]));
    return reply.send({ data: rows.map((r) => ({ organizationId: r.organizationId, name: name.get(r.organizationId) ?? "(deleted organization)", reason: r.reason, ...viewOf(r) })) });
  });

  fastify.post<{ Params: { organizationId: string } }>("/admin/billing/cancellations/:organizationId/approve", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const res = await approveCancellation(fastify.prisma, request.params.organizationId, request.auth.userId);
    if (!res.approved) return reply.status(409).send({ error: { code: "NO_OPEN_REQUEST", message: "There is no open cancellation request for this organization" } });
    return reply.send({ data: { approved: true, finalStatement: res.statement ?? null } });
  });

  // Dismisses an open request, or reactivates an approved cancellation. Either way sending resumes within a minute.
  fastify.post<{ Params: { organizationId: string } }>("/admin/billing/cancellations/:organizationId/reopen", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const ok = await reopenAccount(fastify.prisma, request.params.organizationId);
    if (!ok) return reply.status(409).send({ error: { code: "NOTHING_TO_REOPEN", message: "This organization has no open or approved cancellation" } });
    return reply.send({ data: { reopened: true } });
  });
};
