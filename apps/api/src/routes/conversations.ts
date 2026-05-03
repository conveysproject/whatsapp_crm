import type { FastifyPluginAsync } from "fastify";
import type { ConversationId } from "@WBMSG/shared";

export const conversationsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const conversations = await fastify.prisma.conversation.findMany({
      where: { organizationId },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
    });
    return reply.send({ data: conversations });
  });

  fastify.get<{ Params: { id: ConversationId } }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const messages = await fastify.prisma.message.findMany({
        where: { conversationId: request.params.id },
        orderBy: { sentAt: "asc" },
        take: 100,
      });
      return reply.send({ data: messages });
    }
  );
};
