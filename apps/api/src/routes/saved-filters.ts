import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

interface SavedFilterBody {
  name: string;
  filterData: Record<string, unknown>;
}

export const savedFiltersRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/saved-filters", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.savedFilter.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: SavedFilterBody }>("/saved-filters", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.savedFilter.create({
      data: {
        organizationId,
        name: request.body.name,
        filterData: request.body.filterData as Prisma.InputJsonValue,
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<SavedFilterBody> }>(
    "/saved-filters/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.savedFilter.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.savedFilter.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.name !== undefined && { name: request.body.name }),
          ...(request.body.filterData !== undefined && { filterData: request.body.filterData as Prisma.InputJsonValue }),
        },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/saved-filters/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.savedFilter.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.savedFilter.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
