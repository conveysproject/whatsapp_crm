import type { FastifyPluginAsync } from "fastify";

export const searchRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { q: string; types?: string } }>(
    "/search",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string", minLength: 1 },
            types: { type: "string" },
          },
          required: ["q"],
        },
      },
    },
    async (request) => {
      const { q, types } = request.query;
      const { organizationId } = request.auth;
      const enabled = new Set((types ?? "contacts,conversations,messages").split(","));

      const [contacts, conversations, messages] = await Promise.all([
        enabled.has("contacts")
          ? fastify.prisma.contact.findMany({
              where: {
                organizationId,
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { phoneNumber: { contains: q } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
              select: { id: true, name: true, phoneNumber: true, email: true },
              take: 10,
            })
          : [],
        enabled.has("conversations")
          ? fastify.prisma.conversation.findMany({
              where: {
                organizationId,
                whatsappContactId: { contains: q },
              },
              select: { id: true, whatsappContactId: true, status: true, lastMessageAt: true },
              take: 10,
            })
          : [],
        enabled.has("messages")
          ? fastify.prisma.message.findMany({
              where: {
                organizationId,
                body: { contains: q, mode: "insensitive" },
              },
              select: { id: true, conversationId: true, body: true, sentAt: true },
              take: 10,
            })
          : [],
      ]);

      return {
        data: {
          contacts: contacts.map((c) => ({ ...c, type: "contact" as const })),
          conversations: conversations.map((c) => ({ ...c, type: "conversation" as const })),
          messages: messages.map((m) => ({ ...m, type: "message" as const })),
        },
        meta: { query: q, total: contacts.length + conversations.length + messages.length },
      };
    }
  );
};
