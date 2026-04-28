import type { FastifyPluginAsync } from "fastify";
import { transcribeAudio } from "../lib/whisper.js";
import type { MessageId } from "@trustcrm/shared";

export const transcriptionsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: MessageId } }>(
    "/messages/:id/transcribe",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
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
