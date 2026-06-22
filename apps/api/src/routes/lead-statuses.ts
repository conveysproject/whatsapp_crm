import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";

interface StatusBody {
  name: string;
  color: string;
  isClosure?: boolean;
}

function forbidden(): { error: { code: string; message: string } } {
  return { error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } };
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
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
    if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) return reply.status(403).send(forbidden());
    const { name, color, isClosure } = request.body;
    if (!name?.trim() || !color?.trim()) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "name and color are required" } });
    }
    const max = await fastify.prisma.leadStatus.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;
    try {
      const data = await fastify.prisma.leadStatus.create({
        data: { organizationId, name: name.trim(), color: color.trim(), sortOrder, isClosure: isClosure ?? false },
      });
      return reply.status(201).send({ data });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: { code: "DUPLICATE_NAME", message: "A lead status with this name already exists" } });
      }
      throw err;
    }
  });

  fastify.patch<{ Body: { orderedIds: string[] } }>("/lead-statuses/reorder", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) return reply.status(403).send(forbidden());
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
    if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.leadStatus.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Lead status not found" } });
    const { name, color, isClosure } = request.body;
    try {
      const data = await fastify.prisma.leadStatus.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(color !== undefined ? { color: color.trim() } : {}),
          ...(isClosure !== undefined ? { isClosure } : {}),
        },
      });
      return reply.send({ data });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: { code: "DUPLICATE_NAME", message: "A lead status with this name already exists" } });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>("/lead-statuses/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.leadStatus.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Lead status not found" } });
    const id = request.params.id;
    const inUse = await fastify.prisma.contact.count({ where: { organizationId, leadStatusId: id } });
    if (inUse > 0) {
      return reply.status(409).send({ error: { code: "STATUS_IN_USE", message: "This status is assigned to contacts — reassign them before deleting." } });
    }
    // Block if referenced by Basic Config settings (default or closure statuses)
    const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const contactConfig = ((org?.settings as Record<string, unknown> | null)?.["contactConfig"] ?? {}) as {
      defaultLeadStatusId?: string | null;
      closureLeadStatusIds?: string[];
    };
    if (contactConfig.defaultLeadStatusId === id || (contactConfig.closureLeadStatusIds ?? []).includes(id)) {
      return reply.status(409).send({ error: { code: "STATUS_IN_USE", message: "This status is set as a default or closure status in Basic Configuration — change it there before deleting." } });
    }
    // Block if referenced by a flow's update_stage node
    const flowUse = await fastify.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM "flows"
        WHERE "organization_id" = ${organizationId}
          AND "flow_definition"->'nodes' @> jsonb_build_array(jsonb_build_object('config', jsonb_build_object('leadStatusId', ${id}::text)))
      ) AS exists`;
    if (flowUse[0]?.exists) {
      return reply.status(409).send({ error: { code: "STATUS_IN_USE", message: "This status is used by a flow — update the flow before deleting." } });
    }
    await fastify.prisma.leadStatus.delete({ where: { id } });
    return reply.status(204).send();
  });
};
