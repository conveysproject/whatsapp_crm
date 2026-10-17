import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";

interface RoutingRuleBody {
  name: string;
  priority?: number;
  conditions: object[];
  assignTo: string;
  assignType?: "user" | "team";
}

export const routingRouter: FastifyPluginAsync = async (fastify) => {
  // Section gate: routing assigns chats to teams/agents, so it follows settings_teams.
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_teams")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_teams permission required" } });
    }
  });

  fastify.get("/routing-rules", async (request, reply) => {
    const { organizationId } = request.auth;
    const rules = await fastify.prisma.routingRule.findMany({
      where: { organizationId },
      orderBy: { priority: "desc" },
    });
    return reply.send({ data: rules });
  });

  fastify.post<{ Body: RoutingRuleBody }>("/routing-rules", async (request, reply) => {
    const { organizationId } = request.auth;
    const rule = await fastify.prisma.routingRule.create({
      data: {
        organizationId,
        name: request.body.name,
        priority: request.body.priority ?? 0,
        conditions: request.body.conditions,
        assignTo: request.body.assignTo,
        assignType: request.body.assignType ?? "user",
      },
    });
    return reply.status(201).send({ data: rule });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<RoutingRuleBody> }>(
    "/routing-rules/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.routingRule.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rule not found" } });
      }
      const { name, priority, conditions, assignTo, assignType } = request.body;
      const rule = await fastify.prisma.routingRule.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(priority !== undefined && { priority }),
          ...(conditions !== undefined && { conditions }),
          ...(assignTo !== undefined && { assignTo }),
          ...(assignType !== undefined && { assignType }),
        },
      });
      return reply.send({ data: rule });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/routing-rules/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.routingRule.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rule not found" } });
    }
    await fastify.prisma.routingRule.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
