import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";

interface WebhookBody {
  url: string;
  events: string[];
  isActive?: boolean;
}

const ALLOWED_EVENTS = [
  "message.inbound",
  "message.outbound",
  "conversation.opened",
  "conversation.resolved",
  "contact.created",
  "contact.updated",
  "campaign.completed",
];

export const webhookEndpointsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/webhook-endpoints", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.webhook.findMany({
      where: { organizationId },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: WebhookBody }>("/webhook-endpoints", async (request, reply) => {
    const { organizationId } = request.auth;
    const { url, events, isActive = true } = request.body;
    const invalidEvents = events.filter((e) => !ALLOWED_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return reply.status(400).send({ error: { code: "INVALID_EVENTS", message: `Unknown events: ${invalidEvents.join(", ")}` } });
    }
    const data = await fastify.prisma.webhook.create({
      data: {
        organizationId,
        url,
        events,
        isActive,
        secret: randomBytes(32).toString("hex"),
      },
      select: { id: true, url: true, events: true, isActive: true, secret: true, createdAt: true },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<WebhookBody> }>(
    "/webhook-endpoints/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.webhook.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const { url, events, isActive } = request.body;
      if (events) {
        const invalidEvents = events.filter((e) => !ALLOWED_EVENTS.includes(e));
        if (invalidEvents.length > 0) {
          return reply.status(400).send({ error: { code: "INVALID_EVENTS", message: `Unknown events: ${invalidEvents.join(", ")}` } });
        }
      }
      const data = await fastify.prisma.webhook.update({
        where: { id: request.params.id },
        data: {
          ...(url !== undefined && { url }),
          ...(events !== undefined && { events }),
          ...(isActive !== undefined && { isActive }),
        },
        select: { id: true, url: true, events: true, isActive: true, createdAt: true },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/webhook-endpoints/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.webhook.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.webhook.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/webhook-endpoints/:id/rotate-secret", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.webhook.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.webhook.update({
      where: { id: request.params.id },
      data: { secret: randomBytes(32).toString("hex") },
      select: { id: true, secret: true },
    });
    return reply.send({ data });
  });
};
