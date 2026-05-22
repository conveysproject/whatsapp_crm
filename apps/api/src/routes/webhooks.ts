import type { FastifyPluginAsync } from "fastify";
import type { MessageStatus } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { verifyWebhookSignature } from "../lib/whatsapp.js";
import { inboundMessageQueue } from "../lib/queue.js";

interface WaMediaObject {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WaMediaObject;
  video?: WaMediaObject;
  audio?: WaMediaObject;
  document?: WaMediaObject;
  sticker?: WaMediaObject;
  voice?: WaMediaObject;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
}

interface WaStatusUpdate {
  id: string; // whatsappMessageId
  status: string; // "sent" | "delivered" | "read" | "failed"
  timestamp: string;
  recipient_id: string;
}

interface WaChangeValue {
  messaging_product: string;
  metadata: { phone_number_id: string };
  messages?: WaMessage[];
  statuses?: WaStatusUpdate[];
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
          if (change.field === "message_template_status_update") {
            const { message_template_id, event } = change.value as unknown as { message_template_id: string; event: string };
            const statusMap: Record<string, string> = { APPROVED: "approved", REJECTED: "rejected", PENDING: "pending" };
            const status = statusMap[event] ?? "pending";
            await fastify.prisma.template.updateMany({
              where: { metaTemplateId: message_template_id },
              data: { status: status as "approved" | "rejected" | "pending" },
            });
            continue;
          }

          // Outbound message status updates (delivered / read) with ratchet protection
          if (change.field === "messages" && change.value.statuses?.length) {
            // terminal statuses that cannot be overwritten by a later webhook
            const TERMINAL = new Set<string>(["read"]);
            const STATUS_RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2 };
            for (const su of change.value.statuses) {
              const msg = await fastify.prisma.message.findFirst({
                where: { whatsappMessageId: su.id },
                select: { id: true, status: true },
              });
              if (!msg) continue;
              if (TERMINAL.has(msg.status)) continue; // ratchet: never downgrade from read
              const currentRank = STATUS_RANK[msg.status] ?? 0;
              const newRank = STATUS_RANK[su.status] ?? -1;
              if (newRank <= currentRank) continue; // no downgrade
              const allowedStatuses: MessageStatus[] = ["sent", "delivered", "read", "failed"];
              const newStatus = allowedStatuses.includes(su.status as MessageStatus) ? (su.status as MessageStatus) : null;
              if (!newStatus) continue;
              await fastify.prisma.message.update({
                where: { id: msg.id },
                data: { status: newStatus },
              });
            }
          }

          if (change.field !== "messages" || !change.value.messages?.length) continue;

          const { phone_number_id } = change.value.metadata;
          const org = await fastify.prisma.organization.findFirst({
            where: { phoneNumberId: phone_number_id },
          });
          if (!org) continue;

          for (const msg of change.value.messages) {
            const mediaId = msg.image?.id ?? msg.video?.id ?? msg.audio?.id
              ?? msg.document?.id ?? msg.sticker?.id ?? msg.voice?.id ?? null;
            let body: string | null = null;
            if (msg.text?.body) {
              body = msg.text.body;
            } else if (msg.location) {
              body = `📍 Location: ${msg.location.name ?? ""} (${msg.location.latitude},${msg.location.longitude})`;
            } else if (msg.reaction) {
              body = `${msg.reaction.emoji}`;
            } else if (msg.image?.caption) {
              body = msg.image.caption;
            } else if (msg.video?.caption) {
              body = msg.video.caption;
            } else if (msg.document?.caption) {
              body = msg.document.caption;
            }
            await inboundMessageQueue.add("inbound", {
              organizationId: org.id,
              whatsappContactPhone: msg.from,
              whatsappMessageId: msg.id,
              contentType: msg.type,
              body,
              mediaId,
              timestamp: parseInt(msg.timestamp, 10),
            });
          }
        }
      }

      return reply.status(200).send({ status: "ok" });
    }
  );

  // Meta data deletion callback — required for App Review
  // Meta POSTs application/x-www-form-urlencoded with a signed_request field
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      const params = new URLSearchParams(body as string);
      const obj: Record<string, string> = {};
      params.forEach((value, key) => { obj[key] = value; });
      done(null, obj);
    }
  );

  fastify.post<{ Body: Record<string, string> }>(
    "/webhooks/meta/data-deletion",
    { config: { public: true } },
    async (request, reply) => {
      const signedRequest = request.body["signed_request"];
      if (!signedRequest) {
        return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Missing signed_request" } });
      }

      const dotIndex = signedRequest.indexOf(".");
      if (dotIndex === -1) {
        return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Malformed signed_request" } });
      }

      const encodedSig = signedRequest.slice(0, dotIndex);
      const payload = signedRequest.slice(dotIndex + 1);
      const appSecret = process.env["META_APP_SECRET"] ?? "";

      const expectedSig = createHmac("sha256", appSecret).update(payload).digest("base64url");
      const sigBuf = Buffer.from(encodedSig, "base64url");
      const expectedBuf = Buffer.from(expectedSig, "base64url");

      if (
        sigBuf.length !== expectedBuf.length ||
        !timingSafeEqual(sigBuf, expectedBuf)
      ) {
        return reply.status(403).send({ error: { code: "INVALID_SIGNATURE", message: "Signature mismatch" } });
      }

      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        user_id: string;
        algorithm: string;
        issued_at: number;
      };

      const confirmationCode = `del_${data.user_id}_${Date.now()}`;
      fastify.log.info({ userId: data.user_id, confirmationCode }, "Meta data deletion request received");

      return reply.status(200).send({
        url: `https://conveys.in/data-deletion-status?code=${confirmationCode}`,
        confirmation_code: confirmationCode,
      });
    }
  );
};
