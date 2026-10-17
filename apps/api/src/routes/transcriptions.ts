import type { FastifyPluginAsync } from "fastify";
import { canAccess } from "../lib/permissions.js";
import { conversationListWhere } from "../lib/conversation-access.js";
import { transcribeAudio } from "../lib/whisper.js";
import type { MessageId } from "@WBMSG/shared";

export const transcriptionsRouter: FastifyPluginAsync = async (fastify) => {
  // Section gate: transcription is an inbox feature.
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!(canAccess(role, permissions, "inbox_access"))) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "inbox_access permission required" } });
    }
  });

  fastify.post<{ Params: { id: MessageId } }>(
    "/messages/:id/transcribe",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const convVis = await conversationListWhere(fastify.prisma, request.auth);

      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId, ...(convVis ? { conversation: convVis } : {}) },
      });
      if (!message) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
      }
      if (message.contentType !== "audio" || !message.whatsappMessageId) {
        return reply.status(400).send({ error: { code: "NOT_AUDIO", message: "Message is not a transcribable audio message" } });
      }

      const transcript = await transcribeAudio(
        message.whatsappMessageId,
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );

      const updated = await fastify.prisma.message.update({
        where: { id: message.id },
        data: { body: transcript },
      });

      return reply.send({ data: { transcript, message: updated } });
    }
  );
};
