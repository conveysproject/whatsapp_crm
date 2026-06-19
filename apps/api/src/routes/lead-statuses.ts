import type { FastifyPluginAsync } from "fastify";
import { canAccess } from "../lib/permissions.js";

interface StatusBody {
  name: string;
  color: string;
  isClosure?: boolean;
}

function forbidden(): { error: { code: string; message: string } } {
  return { error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } };
}

export const leadStatusesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/lead-statuses", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.leadStatus.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: StatusBody }>("/lead-statuses", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const { name, color, isClosure } = request.body;
    if (!name?.trim() || !color?.trim()) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "name and color are required" } });
    }
    const max = await fastify.prisma.leadStatus.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;
    const data = await fastify.prisma.leadStatus.create({
      data: { organizationId, name: name.trim(), color: color.trim(), sortOrder, isClosure: isClosure ?? false },
    });
    return reply.status(201).send({ data });
  });

  fastify.patch<{ Body: { orderedIds: string[] } }>("/lead-statuses/reorder", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const orderedIds = request.body.orderedIds ?? [];
    const all = await fastify.prisma.leadStatus.findMany({ where: { organizationId }, select: { id: true } });
    const orgIds = new Set(all.map((s) => s.id));
    if (orderedIds.length !== orgIds.size || !orderedIds.every((id) => orgIds.has(id))) {
      return reply.status(400).send({ error: { code: "INVALID_ORDER", message: "orderedIds must contain exactly the org's lead status ids" } });
    }
    await fastify.prisma.$transaction(
      orderedIds.map((id, index) =>
        fastify.prisma.leadStatus.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    return reply.send({ success: true });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<StatusBody> }>("/lead-statuses/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.leadStatus.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Lead status not found" } });
    const { name, color, isClosure } = request.body;
    const data = await fastify.prisma.leadStatus.update({
      where: { id: request.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color: color.trim() } : {}),
        ...(isClosure !== undefined ? { isClosure } : {}),
      },
    });
    return reply.send({ data });
  });

  fastify.delete<{ Params: { id: string } }>("/lead-statuses/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.leadStatus.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Lead status not found" } });
    const inUse = await fastify.prisma.contact.count({ where: { organizationId, leadStatusId: request.params.id } });
    if (inUse > 0) {
      return reply.status(409).send({ error: { code: "STATUS_IN_USE", message: "This status is assigned to contacts — reassign them before deleting." } });
    }
    await fastify.prisma.leadStatus.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
