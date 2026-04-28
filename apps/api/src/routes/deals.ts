import type { FastifyPluginAsync } from "fastify";
import type { DealId } from "@trustcrm/shared";

interface DealBody {
  title: string;
  pipelineId: string;
  contactId?: string;
  assignedTo?: string;
  value?: number;
  stage?: string;
}

export const dealsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/deals", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const where: Record<string, unknown> = { organizationId };
    if (query["pipelineId"]) where["pipelineId"] = query["pipelineId"];

    const deals = await fastify.prisma.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: deals });
  });

  fastify.get<{ Params: { id: DealId } }>("/deals/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const deal = await fastify.prisma.deal.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!deal) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    }
    return reply.send({ data: deal });
  });

  fastify.post<{ Body: DealBody }>("/deals", async (request, reply) => {
    const { organizationId } = request.auth;
    const deal = await fastify.prisma.deal.create({
      data: {
        organizationId,
        title: request.body.title,
        pipelineId: request.body.pipelineId,
        contactId: request.body.contactId ?? null,
        assignedTo: request.body.assignedTo ?? null,
        value: request.body.value != null ? request.body.value : null,
        stage: request.body.stage ?? "new",
      },
    });
    return reply.status(201).send({ data: deal });
  });

  fastify.patch<{ Params: { id: DealId }; Body: Partial<DealBody> }>("/deals/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.deal.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    }
    const deal = await fastify.prisma.deal.update({
      where: { id: request.params.id },
      data: {
        title: request.body.title,
        contactId: request.body.contactId,
        assignedTo: request.body.assignedTo,
        value: request.body.value,
        stage: request.body.stage,
      },
    });
    return reply.send({ data: deal });
  });

  fastify.patch<{ Params: { id: DealId }; Body: { stage: string } }>(
    "/deals/:id/stage",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.deal.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
      }
      const deal = await fastify.prisma.deal.update({
        where: { id: request.params.id },
        data: { stage: request.body.stage },
      });
      return reply.send({ data: deal });
    }
  );

  fastify.delete<{ Params: { id: DealId } }>("/deals/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.deal.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    }
    await fastify.prisma.deal.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
