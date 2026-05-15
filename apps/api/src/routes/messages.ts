import type { FastifyPluginAsync } from "fastify";
import { sendTextMessage, sendMediaMessage, sendInteractiveMessage } from "../lib/whatsapp.js";
import type { WaInteractivePayload } from "../lib/whatsapp.js";
import type { ConversationId } from "@WBMSG/shared";

type SendMessageBody =
  | { contentType?: "text"; text: string }
  | { contentType: "image" | "video" | "document" | "audio"; mediaId: string; mimeType?: string; filename?: string; caption?: string }
  | { contentType: "interactive"; interactive: WaInteractivePayload };

export const messagesRouter: FastifyPluginAsync = async (fastify) => {
  // ── Message log (all messages with date filter) ──────────────────────────
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      direction?: string;
      contactId?: string;
      page?: string;
    };
  }>("/messages/log", async (request, reply) => {
    const { organizationId } = request.auth;
    const { from, to, direction, contactId, page } = request.query;
    const pageNum = Math.max(1, parseInt(page ?? "1", 10));
    const pageSize = 50;

    const where: Record<string, unknown> = { organizationId };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (direction) where.direction = direction;
    if (contactId) where.conversation = { contactId };

    const [data, total] = await Promise.all([
      fastify.prisma.message.findMany({
        where,
        include: {
          conversation: {
            include: {
              contact: { select: { firstName: true, lastName: true, phoneNumber: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      fastify.prisma.message.count({ where }),
    ]);

    return reply.send({ data, total, page: pageNum, pageSize });
  });

  fastify.post<{ Params: { id: ConversationId }; Body: SendMessageBody }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const body = request.body;

      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
        include: {
          organization: { select: { phoneNumberId: true, wabaAccessToken: true } },
        },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      if (!conversation.whatsappContactId) {
        return reply.status(400).send({ error: { code: "NO_WA_CONTACT", message: "No WhatsApp contact on this conversation" } });
      }

      const phoneNumberId = conversation.organization?.phoneNumberId
        ?? process.env["WA_PHONE_NUMBER_ID"]
        ?? "";
      const accessToken = conversation.organization?.wabaAccessToken
        ?? process.env["WA_ACCESS_TOKEN"]
        ?? "";

      const contentType = body.contentType ?? "text";

      let messageId: string;
      let storedBody: string | null = null;

      if (contentType === "text") {
        const textBody = body as { contentType?: "text"; text: string };
        if (!textBody.text?.trim()) {
          return reply.status(400).send({ error: { code: "MISSING_TEXT", message: "text is required for text messages" } });
        }
        const result = await sendTextMessage(phoneNumberId, conversation.whatsappContactId, textBody.text.trim(), accessToken);
        messageId = result.messageId;
        storedBody = textBody.text.trim();
      } else if (contentType === "interactive") {
        const intBody = body as { contentType: "interactive"; interactive: WaInteractivePayload };
        if (!intBody.interactive) {
          return reply.status(400).send({ error: { code: "MISSING_INTERACTIVE", message: "interactive payload required" } });
        }
        const result = await sendInteractiveMessage(phoneNumberId, conversation.whatsappContactId, intBody.interactive, accessToken);
        messageId = result.messageId;
        storedBody = JSON.stringify(intBody.interactive);
      } else {
        const mediaBody = body as { contentType: "image" | "video" | "document" | "audio"; mediaId: string; caption?: string };
        if (!mediaBody.mediaId) {
          return reply.status(400).send({ error: { code: "MISSING_MEDIA_ID", message: "mediaId is required for media messages" } });
        }
        const result = await sendMediaMessage(
          phoneNumberId,
          conversation.whatsappContactId,
          contentType,
          mediaBody.mediaId,
          mediaBody.caption,
          accessToken
        );
        messageId = result.messageId;
        storedBody = mediaBody.caption ?? null;
      }

      const message = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType,
          body: storedBody,
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
