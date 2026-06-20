import type { FastifyPluginAsync } from "fastify";
import { canAccess } from "../lib/permissions.js";

interface RuleBody {
  name: string;
  trigger: string;
  conditions?: unknown[];
  assignType?: "user" | "team";
  assignTo: string;
  replacePrevious?: boolean;
  isActive?: boolean;
}

function forbidden(): { error: { code: string; message: string } } {
  return { error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } };
}

async function assigneeValid(
  prisma: Parameters<FastifyPluginAsync>[0]["prisma"],
  organizationId: string,
  assignType: "user" | "team",
  assignTo: string,
): Promise<boolean> {
  if (assignType === "team") {
    return !!(await prisma.team.findFirst({ where: { id: assignTo, organizationId }, select: { id: true } }));
  }
  return !!(await prisma.user.findFirst({ where: { id: assignTo, organizationId }, select: { id: true } }));
}

export const contactAssignmentRulesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/contact-assignment-rules", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.contactAssignmentRule.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: RuleBody }>("/contact-assignment-rules", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const { name, trigger, conditions, assignType = "user", assignTo, replacePrevious, isActive } = request.body;
    if (!name?.trim() || !trigger?.trim() || !assignTo?.trim()) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "name, trigger and assignTo are required" } });
    }
    if (!(await assigneeValid(fastify.prisma, organizationId, assignType, assignTo))) {
      return reply.status(400).send({ error: { code: "INVALID_ASSIGNEE", message: "assignTo not found in organization" } });
    }
    const max = await fastify.prisma.contactAssignmentRule.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
    const data = await fastify.prisma.contactAssignmentRule.create({
      data: {
        organizationId,
        name: name.trim(),
        trigger,
        conditions: (conditions ?? []) as object,
        assignType,
        assignTo,
        replacePrevious: replacePrevious ?? false,
        isActive: isActive ?? true,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<RuleBody> }>("/contact-assignment-rules/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.contactAssignmentRule.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rule not found" } });
    const { name, trigger, conditions, assignType, assignTo, replacePrevious, isActive } = request.body;
    const nextType = (assignType ?? existing.assignType) as "user" | "team";
    const nextAssignee = assignTo ?? existing.assignTo;
    if ((assignType !== undefined || assignTo !== undefined) && !(await assigneeValid(fastify.prisma, organizationId, nextType, nextAssignee))) {
      return reply.status(400).send({ error: { code: "INVALID_ASSIGNEE", message: "assignTo not found in organization" } });
    }
    const data = await fastify.prisma.contactAssignmentRule.update({
      where: { id: request.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(trigger !== undefined ? { trigger } : {}),
        ...(conditions !== undefined ? { conditions: conditions as object } : {}),
        ...(assignType !== undefined ? { assignType } : {}),
        ...(assignTo !== undefined ? { assignTo } : {}),
        ...(replacePrevious !== undefined ? { replacePrevious } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    return reply.send({ data });
  });

  fastify.delete<{ Params: { id: string } }>("/contact-assignment-rules/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.contactAssignmentRule.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rule not found" } });
    await fastify.prisma.contactAssignmentRule.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
