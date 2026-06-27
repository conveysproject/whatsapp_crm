import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";

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
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_tags")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_tags permission required" } });
    }
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

  // Rename a tag — replaces it on every contact in the org
  fastify.patch<{ Params: { tag: string }; Body: { newTag: string } }>("/tags/:tag", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_tags")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_tags permission required" } });
    }
    const oldTag = decodeURIComponent(request.params.tag);
    const { newTag } = request.body;
    if (!newTag?.trim()) {
      return reply.status(400).send({ error: { code: "INVALID", message: "newTag is required" } });
    }
    const trimmed = newTag.trim().toLowerCase();

    const contacts = await fastify.prisma.contact.findMany({
      where: { organizationId, deletedAt: null, tags: { has: oldTag } },
      select: { id: true, tags: true },
    });

    await Promise.all(
      contacts.map((c) =>
        fastify.prisma.contact.update({
          where: { id: c.id },
          data: { tags: c.tags.map((t) => (t === oldTag ? trimmed : t)) },
        }),
      ),
    );

    return reply.status(204).send();
  });
};
