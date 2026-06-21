import type { FastifyPluginAsync } from "fastify";

export const tagsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/tags", async (request, reply) => {
    const { organizationId } = request.auth;
    const contacts = await fastify.prisma.contact.findMany({
      where: { organizationId, deletedAt: null },
      select: { tags: true },
    });

    const counts = new Map<string, number>();
    for (const c of contacts) {
      for (const tag of c.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const data = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    return reply.send({ data });
  });

  // Bulk-delete a tag — removes it from every contact in the org
  fastify.delete<{ Params: { tag: string } }>("/tags/:tag", async (request, reply) => {
    const { organizationId } = request.auth;
    const tag = decodeURIComponent(request.params.tag);

    const contacts = await fastify.prisma.contact.findMany({
      where: { organizationId, deletedAt: null, tags: { has: tag } },
      select: { id: true, tags: true },
    });

    await Promise.all(
      contacts.map((c) =>
        fastify.prisma.contact.update({
          where: { id: c.id },
          data: { tags: c.tags.filter((t) => t !== tag) },
        }),
      ),
    );

    return reply.status(204).send();
  });
};
