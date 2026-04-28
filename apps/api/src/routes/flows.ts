import type { FastifyPluginAsync } from "fastify";
import { flowQueue } from "../lib/queue.js";
import type { FlowDefinition, FlowTriggerPayload } from "../lib/flow-runner.js";

interface FlowBody {
  name: string;
  triggerType: string;
  flowDefinition: FlowDefinition;
}

export const flowsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/flows", async (request, reply) => {
    const { organizationId } = request.auth;
    const flows = await fastify.prisma.flow.findMany({ where: { organizationId } });
    return reply.send({ data: flows });
  });

  fastify.get<{ Params: { id: string } }>("/flows/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const flow = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
    if (!flow) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    return reply.send({ data: flow });
  });

  fastify.post<{ Body: FlowBody }>("/flows", async (request, reply) => {
    const { organizationId } = request.auth;
    const flow = await fastify.prisma.flow.create({
      data: {
        organizationId,
        name: request.body.name,
        triggerType: request.body.triggerType,
        isActive: false,
        flowDefinition: request.body.flowDefinition as object,
      },
    });
    return reply.status(201).send({ data: flow });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<FlowBody> & { isActive?: boolean } }>(
    "/flows/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
      const flow = await fastify.prisma.flow.update({
        where: { id: request.params.id },
        data: request.body as object,
      });
      return reply.send({ data: flow });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/flows/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    await fastify.prisma.flow.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string }; Body: FlowTriggerPayload }>(
    "/flows/:id/test",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const flow = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
      if (!flow) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });

      await flowQueue.add("test-flow", { flowId: flow.id, payload: { ...request.body, organizationId } });
      return reply.send({ data: { status: "queued", message: "Flow test job enqueued" } });
    }
  );
};
