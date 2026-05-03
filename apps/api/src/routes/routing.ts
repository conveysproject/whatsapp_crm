import type { FastifyPluginAsync } from "fastify";
import type { ConversationId } from "@WBMSG/shared";

interface RoutingRuleBody {
  name: string;
  priority?: number;
  conditions: object[];
  assignTo: string;
  assignType?: "user" | "team";
}

export const routingRouter: FastifyPluginAsync = async (fastify) => {
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

  fastify.patch<{ Params: { id: ConversationId }; Body: { assignedTo: string } }>(
    "/conversations/:id/assign",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const updated = await fastify.prisma.conversation.update({
        where: { id: request.params.id },
        data: { assignedTo: request.body.assignedTo },
      });
      return reply.send({ data: updated });
    }
  );
};
