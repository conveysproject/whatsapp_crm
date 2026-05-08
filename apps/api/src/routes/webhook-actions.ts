import type { FastifyPluginAsync } from "fastify";

interface WebhookActionBody {
  title: string;
  conditionKey: string;
  conditionValue: string;
  templateId?: string;
  isActive?: boolean;
}

export const webhookActionsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/webhook-actions", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.responseWebhookAction.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: WebhookActionBody }>("/webhook-actions", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.responseWebhookAction.create({
      data: {
        organizationId,
        title: request.body.title,
        conditionKey: request.body.conditionKey,
        conditionValue: request.body.conditionValue,
        templateId: request.body.templateId ?? null,
        isActive: request.body.isActive ?? true,
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<WebhookActionBody> }>(
    "/webhook-actions/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.responseWebhookAction.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const { title, conditionKey, conditionValue, templateId, isActive } = request.body;
      const data = await fastify.prisma.responseWebhookAction.update({
        where: { id: request.params.id },
        data: {
          ...(title !== undefined && { title }),
          ...(conditionKey !== undefined && { conditionKey }),
          ...(conditionValue !== undefined && { conditionValue }),
          ...(templateId !== undefined && { templateId }),
          ...(isActive !== undefined && { isActive }),
        },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/webhook-actions/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.responseWebhookAction.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.responseWebhookAction.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/webhook-actions/:id/logs",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.responseWebhookAction.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.responseWebhookActionLog.findMany({
        where: { actionId: request.params.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );
};
