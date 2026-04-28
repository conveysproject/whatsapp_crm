import type { FastifyPluginAsync } from "fastify";
import { verifyWebhookSignature } from "../lib/whatsapp.js";
import { inboundMessageQueue } from "../lib/queue.js";

interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WaChangeValue {
  messaging_product: string;
  metadata: { phone_number_id: string };
  messages?: WaMessage[];
}

interface WaEntry {
  id: string;
  changes: Array<{ value: WaChangeValue; field: string }>;
}

interface WhatsAppWebhookBody {
  object: string;
  entry: WaEntry[];
}

export const webhooksRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/webhooks/whatsapp",
    { config: { public: true } },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const mode = query["hub.mode"];
      const token = query["hub.verify_token"];
      const challenge = query["hub.challenge"];

      if (mode === "subscribe" && token === process.env["WA_VERIFY_TOKEN"]) {
        return reply.send(challenge);
      }
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Token mismatch" } });
    }
  );

  fastify.post<{ Body: WhatsAppWebhookBody }>(
    "/webhooks/whatsapp",
    { config: { public: true } },
    async (request, reply) => {
      const signature = (request.headers["x-hub-signature-256"] as string) ?? "";
      const rawBody = JSON.stringify(request.body);
      const secret = process.env["WA_WEBHOOK_SECRET"] ?? "";

      if (!verifyWebhookSignature(rawBody, signature, secret)) {
        return reply.status(403).send({ error: { code: "INVALID_SIGNATURE", message: "Signature mismatch" } });
      }

      if (request.body.object !== "whatsapp_business_account") {
        return reply.status(400).send({ error: { code: "UNKNOWN_OBJECT", message: "Unrecognised webhook object" } });
      }

      for (const entry of request.body.entry) {
        for (const change of entry.changes) {
          if (change.field !== "messages" || !change.value.messages?.length) continue;

          const { phone_number_id } = change.value.metadata;
          const org = await fastify.prisma.organization.findFirst({
            where: { phoneNumberId: phone_number_id },
          });
          if (!org) continue;

          for (const msg of change.value.messages) {
            await inboundMessageQueue.add("inbound", {
              organizationId: org.id,
              whatsappContactPhone: msg.from,
              whatsappMessageId: msg.id,
              contentType: msg.type,
              body: msg.text?.body ?? null,
              mediaId: null,
              timestamp: parseInt(msg.timestamp, 10),
            });
          }
        }
      }

      return reply.status(200).send({ status: "ok" });
    }
  );
};
