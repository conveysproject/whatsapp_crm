import type { FastifyPluginAsync } from "fastify";
import type { PipelineId } from "@WBMSG/shared";

interface PipelineBody {
  name: string;
  stages: string[];
}

export const pipelinesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/pipelines", async (request, reply) => {
    const { organizationId } = request.auth;
    const pipelines = await fastify.prisma.pipeline.findMany({ where: { organizationId } });
    return reply.send({ data: pipelines });
  });

  fastify.post<{ Body: PipelineBody }>("/pipelines", async (request, reply) => {
    const { organizationId } = request.auth;
    const pipeline = await fastify.prisma.pipeline.create({
      data: { organizationId, name: request.body.name, stages: request.body.stages },
    });
    return reply.status(201).send({ data: pipeline });
  });

  fastify.patch<{ Params: { id: PipelineId }; Body: Partial<PipelineBody> }>(
    "/pipelines/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.pipeline.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Pipeline not found" } });
      }
      const pipeline = await fastify.prisma.pipeline.update({
        where: { id: request.params.id },
        data: { name: request.body.name, stages: request.body.stages },
      });
      return reply.send({ data: pipeline });
    }
  );

  fastify.delete<{ Params: { id: PipelineId } }>("/pipelines/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.pipeline.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Pipeline not found" } });
    }
    await fastify.prisma.pipeline.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
