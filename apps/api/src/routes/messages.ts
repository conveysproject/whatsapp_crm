import type { FastifyPluginAsync } from "fastify";
import { sendTextMessage } from "../lib/whatsapp.js";
import type { ConversationId } from "@WBMSG/shared";

interface SendMessageBody {
  text: string;
}

export const messagesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: ConversationId }; Body: SendMessageBody }>(
    "/conversations/:id/messages",
    {
      schema: {
        body: {
          type: "object",
          required: ["text"],
          properties: { text: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.auth;

      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      if (!conversation.whatsappContactId) {
        return reply.status(400).send({ error: { code: "NO_WA_CONTACT", message: "No WhatsApp contact on this conversation" } });
      }

      const phoneNumberId = process.env["WA_PHONE_NUMBER_ID"] ?? "";
      const accessToken = process.env["WA_ACCESS_TOKEN"] ?? "";

      const { messageId } = await sendTextMessage(
        phoneNumberId,
        conversation.whatsappContactId,
        request.body.text,
        accessToken
      );

      const message = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType: "text",
          body: request.body.text,
          whatsappMessageId: messageId,
          status: "sent",
        },
      });

      await fastify.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return reply.status(201).send({ data: message });
    }
  );
};
