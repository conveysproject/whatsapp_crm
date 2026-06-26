import type { FastifyPluginAsync } from "fastify";
import type { ContactId } from "@WBMSG/shared";
import { canAccess } from "../lib/permissions.js";

interface EventBody {
  name: string;
  properties?: Record<string, string | number | boolean>;
  occurredAt?: string;
}

export const contactEventsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/contacts/events/names", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "contacts_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "contacts_access required" } });
    }
    const rows = await fastify.prisma.contactEvent.groupBy({
      by: ["name"],
      where: { organizationId },
    });
    const names = rows.map((r) => r.name).sort();
    return reply.send({ data: names });
  });

  fastify.get<{ Params: { name: string } }>(
    "/contacts/events/:name/properties",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "contacts_access")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "contacts_access required" } });
      }
      const events = await fastify.prisma.contactEvent.findMany({
        where: { organizationId, name: request.params.name },
        select: { properties: true },
        take: 200,
      });
      const keySet = new Set<string>();
      for (const ev of events) {
        const props = ev.properties as Record<string, unknown>;
        for (const key of Object.keys(props)) keySet.add(key);
      }
      return reply.send({ data: Array.from(keySet).sort() });
    }
  );

  fastify.post<{ Params: { id: ContactId }; Body: EventBody }>(
    "/contacts/:id/events",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "contacts_access")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "contacts_access required" } });
      }
      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId, deletedAt: null },
      });
      if (!contact) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }
      const event = await fastify.prisma.contactEvent.create({
        data: {
          organizationId,
          contactId: contact.id,
          name: request.body.name,
          properties: (request.body.properties ?? {}) as object,
          ...(request.body.occurredAt ? { occurredAt: new Date(request.body.occurredAt) } : {}),
        },
      });
      return reply.status(201).send({ data: event });
    }
  );
};
