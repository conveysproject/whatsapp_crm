import type { FastifyPluginAsync } from "fastify";

export const countriesRouter: FastifyPluginAsync = async (fastify) => {
  // Public read — countries are static reference data, no org scope needed.
  fastify.get("/countries", async (_request, reply) => {
    const data = await fastify.prisma.country.findMany({
      orderBy: { name: "asc" },
      select: { id: true, isoCode: true, name: true, iso3Code: true, phoneCode: true },
    });
    return reply.send({ data });
  });

  fastify.get<{ Params: { id: string } }>("/countries/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: { code: "INVALID_ID", message: "Country id must be an integer" } });
    const country = await fastify.prisma.country.findUnique({ where: { id } });
    if (!country) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Country not found" } });
    return reply.send({ data: country });
  });
};
