import type { FastifyPluginAsync } from "fastify";
import { generateSuggestions, detectIntent, analyzeSentiment } from "../lib/claude.js";
import type { ConversationId, MessageId } from "@trustcrm/shared";

export const aiRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: ConversationId } }>(
    "/conversations/:id/suggestions",
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
        orderBy: { sentAt: "desc" },
        take: 10,
      });

      const history = messages
        .reverse()
        .filter((m) => m.body)
        .map((m) => ({
          role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
          content: m.body ?? "",
        }));

      const suggestions = await generateSuggestions(history);
      return reply.send({ data: { suggestions } });
    }
  );

  fastify.post<{ Params: { id: MessageId } }>(
    "/messages/:id/analyze",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!message) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
      }
      if (!message.body) {
        return reply.status(400).send({ error: { code: "NO_BODY", message: "Message has no text body to analyze" } });
      }

      const [intent, sentiment] = await Promise.all([
        detectIntent(message.body),
        analyzeSentiment(message.body),
      ]);

      return reply.send({ data: { intent, sentiment } });
    }
  );
};
