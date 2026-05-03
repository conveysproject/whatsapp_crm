import type { FastifyPluginAsync } from "fastify";
import type { ContactId } from "@WBMSG/shared";

const ML_URL = process.env["ML_SERVICE_URL"] ?? "http://localhost:8000";

export const trustScoreRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id/trust-score", async (request, reply) => {
    const { organizationId } = request.auth;

    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }

    const messages = await fastify.prisma.message.findMany({
      where: { organizationId },
      select: { direction: true, sentAt: true },
      orderBy: { sentAt: "desc" },
    });

    const daysSinceLast = messages[0]
      ? Math.floor((Date.now() - messages[0].sentAt.getTime()) / 86_400_000)
      : 999;

    const deals = await fastify.prisma.deal.findMany({
      where: { organizationId, contactId: contact.id },
      select: { value: true },
    });

    const mlRes = await fetch(`${ML_URL}/trust-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lifecycle_stage: contact.lifecycleStage,
        message_count: messages.length,
        inbound_count: messages.filter((m) => m.direction === "inbound").length,
        outbound_count: messages.filter((m) => m.direction === "outbound").length,
        days_since_last_message: daysSinceLast,
        deal_count: deals.length,
        total_deal_value: deals.reduce((sum, d) => sum + Number(d.value ?? 0), 0),
        tag_count: contact.tags.length,
      }),
    });

    if (!mlRes.ok) {
      return reply.status(502).send({ error: { code: "ML_UNAVAILABLE", message: "ML service unavailable" } });
    }

    const score = await mlRes.json() as { score: number; label: string };
    return reply.send({ data: score });
  });
};
