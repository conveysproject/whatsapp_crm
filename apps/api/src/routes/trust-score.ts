import type { FastifyPluginAsync } from "fastify";
import type { ContactId } from "@WBMSG/shared";

const ML_URL = process.env["ML_SERVICE_URL"] ?? "http://localhost:8000";

interface Recommendation {
  text: string;
  href: string;
}

export const trustScoreRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { history?: string } }>("/trust-score", async (request, reply) => {
    const { organizationId } = request.auth;

    const [totalMessages, deliveredMessages, inboundMessages, totalContacts, contactsWithTags, campaigns] =
      await Promise.all([
        fastify.prisma.message.count({ where: { organizationId, direction: "outbound" } }),
        fastify.prisma.message.count({ where: { organizationId, direction: "outbound", status: "delivered" } }),
        fastify.prisma.message.count({ where: { organizationId, direction: "inbound" } }),
        fastify.prisma.contact.count({ where: { organizationId, deletedAt: null } }),
        fastify.prisma.contact.count({ where: { organizationId, deletedAt: null, tags: { isEmpty: false } } }),
        fastify.prisma.campaign.findMany({
          where: { organizationId, status: "completed" },
          select: { id: true },
          take: 50,
        }),
      ]);

    const deliveryRate = totalMessages > 0 ? deliveredMessages / totalMessages : 0;
    const deliveryScore = Math.round(deliveryRate * 30);
    const deliveryDesc = totalMessages === 0
      ? "No outbound messages yet"
      : `${deliveredMessages} of ${totalMessages} messages delivered`;

    const responseRate = totalMessages > 0 ? Math.min(1, inboundMessages / totalMessages) : 0;
    const responseScore = Math.round(responseRate * 25);
    const responseDesc = `${inboundMessages} inbound replies vs ${totalMessages} outbound messages`;

    const contactQualityRate = totalContacts > 0 ? contactsWithTags / totalContacts : 0;
    const contactScore = Math.round(contactQualityRate * 25);
    const contactDesc = totalContacts === 0
      ? "No contacts yet"
      : `${contactsWithTags} of ${totalContacts} contacts have tags`;

    const campaignScore = Math.min(20, campaigns.length * 2);
    const campaignDesc = `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""} executed`;

    const total = deliveryScore + responseScore + contactScore + campaignScore;

    const recommendations: Recommendation[] = [];
    if (deliveryRate < 0.8 && totalMessages > 0) {
      recommendations.push({
        text: "Check phone number validity — low delivery rate may indicate stale contacts.",
        href: "/contacts",
      });
    }
    if (responseRate < 0.1 && totalMessages > 50) {
      recommendations.push({
        text: "Increase engagement by using personalised messages and follow-ups.",
        href: "/campaigns/new",
      });
    }
    if (contactQualityRate < 0.3 && totalContacts > 0) {
      recommendations.push({
        text: "Tag your contacts with lifecycle stage and interest to improve targeting.",
        href: "/contacts",
      });
    }
    if (campaigns.length === 0) {
      recommendations.push({
        text: "Run your first campaign to start building engagement history.",
        href: "/campaigns/new",
      });
    }
    if (responseRate < 0.1 && totalMessages > 50) {
      recommendations.push({
        text: "Set up an auto-reply flow to respond instantly.",
        href: "/flows/new",
      });
    }

    let history: { score: number; recordedAt: string }[] | undefined;
    if (request.query.history === "true") {
      const snapshots = await fastify.prisma.orgTrustScoreSnapshot.findMany({
        where: { organizationId },
        orderBy: { recordedAt: "asc" },
        take: 90,
        select: { score: true, recordedAt: true },
      });
      history = snapshots.map((s) => ({ score: s.score, recordedAt: s.recordedAt.toISOString() }));
    }

    return reply.send({
      data: {
        score: total,
        breakdown: [
          { category: "Delivery Rate",     score: deliveryScore,  maxScore: 30, description: deliveryDesc },
          { category: "Response Rate",     score: responseScore,  maxScore: 25, description: responseDesc },
          { category: "Contact Quality",   score: contactScore,   maxScore: 25, description: contactDesc },
          { category: "Campaign Activity", score: campaignScore,  maxScore: 20, description: campaignDesc },
        ],
        recommendations,
        ...(history !== undefined ? { history } : {}),
      },
    });
  });

  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id/trust-score", async (request, reply) => {
    const { organizationId } = request.auth;

    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }

    const messages = await fastify.prisma.message.findMany({
      where: { organizationId, conversation: { contactId: contact.id } },
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
