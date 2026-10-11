import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { parseBillingDetails, readBillingDetails } from "../lib/billing/billing-details.js";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: "settings_billing permission required" } };

/** The caller's own organization's billing details (statement email, legal name, GST number, address). Org from request.auth only. */
export const billingDetailsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/billing/details", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) return reply.status(403).send(FORBIDDEN);
    const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    return reply.send({ data: readBillingDetails(org.settings) });
  });

  fastify.put<{ Body: unknown }>("/billing/details", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) return reply.status(403).send(FORBIDDEN);
    const parsed = parseBillingDetails(request.body);
    if (!parsed.ok) return reply.status(400).send({ error: { code: "INVALID_DETAILS", message: parsed.error } });
    const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    const current = org.settings && typeof org.settings === "object" && !Array.isArray(org.settings) ? (org.settings as Record<string, unknown>) : {};
    await fastify.prisma.organization.update({ where: { id: organizationId }, data: { settings: { ...current, billing: parsed.details } as never } });
    return reply.send({ data: parsed.details });
  });
};
