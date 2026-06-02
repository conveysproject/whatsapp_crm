import type { FastifyPluginAsync } from "fastify";

export const tagsRouter: FastifyPluginAsync = async (fastify) => {
  // Return all unique tags in use across contacts for this org, with usage counts
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
};
