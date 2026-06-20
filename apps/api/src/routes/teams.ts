import type { FastifyPluginAsync } from "fastify";

export const teamsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/teams", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.team.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return reply.send({ data });
  });
};
