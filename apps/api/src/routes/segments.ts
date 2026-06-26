import type { FastifyPluginAsync } from "fastify";
import { evaluateSegment, type FilterRule, type MatchMode } from "../lib/segment-evaluator.js";
import type { SegmentId } from "@WBMSG/shared";
import { canAccess } from "../lib/permissions.js";

interface SegmentBody {
  name: string;
  filters: FilterRule[];
  match?: MatchMode;
  whatsappOptedOnly?: boolean;
}

export const segmentsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/segments", async (request, reply) => {
    const { organizationId } = request.auth;
    const segments = await fastify.prisma.segment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: segments });
  });

  fastify.get<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!segment) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    return reply.send({ data: segment });
  });

  fastify.post<{ Body: SegmentBody }>("/segments", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "contacts_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: contacts_access" } });
    }
    const filters = request.body.filters ?? [];
    const match = request.body.match ?? "all";
    const whatsappOptedOnly = request.body.whatsappOptedOnly ?? false;
    const evalResult = await evaluateSegment(fastify.prisma, organizationId, filters, match, whatsappOptedOnly);
    const segment = await fastify.prisma.segment.create({
      data: {
        organizationId,
        name: request.body.name,
        filters: filters as object,
        match,
        whatsappOptedOnly,
        lastContactCount: evalResult.count,
        lastSyncAt: new Date(),
      },
    });
    return reply.status(201).send({ data: segment });
  });

  fastify.patch<{ Params: { id: SegmentId }; Body: Partial<SegmentBody> }>(
    "/segments/:id",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "contacts_access")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: contacts_access" } });
      }
      const existing = await fastify.prisma.segment.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
      }
      const updatedFilters = request.body.filters ?? (existing.filters as unknown as FilterRule[]);
      const updatedMatch = (request.body.match ?? existing.match) as MatchMode;
      const updatedOptedOnly = request.body.whatsappOptedOnly ?? (existing as { whatsappOptedOnly?: boolean }).whatsappOptedOnly ?? false;
      const evalResult = await evaluateSegment(fastify.prisma, organizationId, updatedFilters, updatedMatch, updatedOptedOnly);
      const segment = await fastify.prisma.segment.update({
        where: { id: request.params.id, organizationId },
        data: {
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.filters !== undefined ? { filters: request.body.filters as object } : {}),
          ...(request.body.match !== undefined ? { match: request.body.match } : {}),
          ...(request.body.whatsappOptedOnly !== undefined ? { whatsappOptedOnly: request.body.whatsappOptedOnly } : {}),
          lastContactCount: evalResult.count,
          lastSyncAt: new Date(),
        },
      });
      return reply.send({ data: segment });
    }
  );

  fastify.delete<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "contacts_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: contacts_access" } });
    }
    const existing = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    await fastify.prisma.segment.delete({ where: { id: request.params.id, organizationId } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: SegmentId } }>("/segments/:id/evaluate", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!segment) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    const filters = segment.filters as unknown as FilterRule[];
    const match = (segment.match as MatchMode) ?? "all";
    const whatsappOptedOnly = (segment as { whatsappOptedOnly?: boolean }).whatsappOptedOnly ?? false;
    const result = await evaluateSegment(fastify.prisma, organizationId, filters, match, whatsappOptedOnly);
    await fastify.prisma.segment.update({
      where: { id: request.params.id, organizationId },
      data: { lastContactCount: result.count, lastSyncAt: new Date() },
    });
    return reply.send({ data: result });
  });
};
