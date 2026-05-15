import type { FastifyPluginAsync } from "fastify";

interface InfoMaterialBody {
  name: string;
  type: string;
  url?: string;
  fileUrl?: string;
  description?: string;
}

export const infoMaterialsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { type?: string } }>("/info-materials", async (request, reply) => {
    const { organizationId } = request.auth;
    const { type } = request.query;
    const items = await fastify.prisma.infoMaterial.findMany({
      where: { organizationId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: items });
  });

  fastify.post<{ Body: InfoMaterialBody }>("/info-materials", async (request, reply) => {
    const { organizationId } = request.auth;
    const { name, type, url, fileUrl, description } = request.body;
    if (!name || !type) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "name and type are required" } });
    }
    const item = await fastify.prisma.infoMaterial.create({
      data: { organizationId, name, type, url: url ?? null, fileUrl: fileUrl ?? null, description: description ?? null },
    });
    return reply.status(201).send({ data: item });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<InfoMaterialBody> }>(
    "/info-materials/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const item = await fastify.prisma.infoMaterial.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!item) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Info material not found" } });
      }
      const { name, description, url, fileUrl } = request.body;
      const updated = await fastify.prisma.infoMaterial.update({
        where: { id: item.id },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(url !== undefined ? { url } : {}),
          ...(fileUrl !== undefined ? { fileUrl } : {}),
        },
      });
      return reply.send({ data: updated });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/info-materials/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const item = await fastify.prisma.infoMaterial.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!item) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Info material not found" } });
    }
    await fastify.prisma.infoMaterial.delete({ where: { id: item.id } });
    return reply.status(204).send();
  });
};
