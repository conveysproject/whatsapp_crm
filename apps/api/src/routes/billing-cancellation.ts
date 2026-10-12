import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { requestCancellation, viewOf, withdrawCancellation } from "../lib/billing/cancellation.js";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: "settings_billing permission required" } };

/** The caller's own organization's cancellation: see its state, ask to cancel, or withdraw the request. The owner approves. */
export const billingCancellationRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/billing/cancellation", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) return reply.status(403).send(FORBIDDEN);
    const row = await fastify.prisma.billingCancellation.findUnique({ where: { organizationId }, select: { status: true, requestedAt: true, approvedAt: true } });
    return reply.send({ data: row ? viewOf(row) : null });
  });

  fastify.post<{ Body: { reason?: unknown; confirm?: unknown } }>("/billing/cancellation", async (request, reply) => {
    const { organizationId, userId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) return reply.status(403).send(FORBIDDEN);
    const { reason, confirm } = request.body ?? {};
    // The client must say it asked the person to confirm: a stray request can never cancel anything.
    if (confirm !== true) return reply.status(400).send({ error: { code: "CONFIRMATION_REQUIRED", message: "confirm must be true" } });
    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      return reply.status(400).send({ error: { code: "INVALID_REASON", message: "reason must be text" } });
    }
    const result = await requestCancellation(fastify.prisma, { organizationId, userId, reason: typeof reason === "string" ? reason : null });
    if (result === "exists") return reply.status(409).send({ error: { code: "ALREADY_REQUESTED", message: "A cancellation request already exists for this account" } });
    return reply.status(201).send({ data: { status: "requested" } });
  });

  fastify.post("/billing/cancellation/withdraw", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) return reply.status(403).send(FORBIDDEN);
    const ok = await withdrawCancellation(fastify.prisma, organizationId);
    if (!ok) return reply.status(409).send({ error: { code: "NOTHING_TO_WITHDRAW", message: "There is no open request to withdraw" } });
    return reply.send({ data: { status: "withdrawn" } });
  });
};
