import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { evaluateSegment, type FilterRule } from "../lib/segment-evaluator.js";

interface Body { mode?: unknown; groupIds?: unknown; segmentId?: unknown }

const MAX_GROUPS = 200;

/**
 * How many contacts a campaign would be sent to, resolved the same way the sender does it (segment, selected groups,
 * or every contact who has not opted out) but always inside the caller's own organization. Counts only.
 */
export const campaignAudienceRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>("/campaigns/audience-size", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "campaigns_access", "campaigns_create")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "campaigns_create permission required" } });
    }
    const { mode, groupIds, segmentId } = request.body ?? {};

    if (mode === "segment") {
      if (typeof segmentId !== "string" || segmentId.length === 0) {
        return reply.status(400).send({ error: { code: "INVALID_SEGMENT", message: "segmentId is required" } });
      }
      const segment = await fastify.prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
      if (!segment) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
      const result = await evaluateSegment(fastify.prisma, organizationId, segment.filters as unknown as FilterRule[]);
      return reply.send({ data: { count: new Set(result.contacts.map((c) => c.phoneNumber)).size } });
    }

    if (mode === "groups") {
      if (!Array.isArray(groupIds) || groupIds.length === 0 || groupIds.length > MAX_GROUPS || !groupIds.every((g) => typeof g === "string")) {
        return reply.status(400).send({ error: { code: "INVALID_GROUPS", message: `groupIds must be a list of 1 to ${MAX_GROUPS} ids` } });
      }
      // Only groups of this organization count, whatever ids the client sends.
      const rows = await fastify.prisma.groupContact.findMany({
        where: { contactGroupId: { in: groupIds as string[] }, contactGroup: { organizationId } },
        select: { contact: { select: { phoneNumber: true } } },
      });
      return reply.send({ data: { count: new Set(rows.map((r) => r.contact.phoneNumber)).size } });
    }

    if (mode === "all") {
      const count = await fastify.prisma.contact.count({ where: { organizationId, whatsappOptOut: false } });
      return reply.send({ data: { count } });
    }

    return reply.status(400).send({ error: { code: "INVALID_MODE", message: "mode must be all, groups or segment" } });
  });
};
