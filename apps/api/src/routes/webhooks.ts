import type { FastifyPluginAsync } from "fastify";
import type { MessageStatus, CampaignRecipientStatus } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { Readable } from "stream";
import { verifyWebhookSignature } from "../lib/whatsapp.js";
import { inboundMessageQueue } from "../lib/queue.js";
import { getIo } from "../lib/io-ref.js";

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
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
    nfm_reply?: { response_json: string; name: string; body: string };
  };
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
  // Buffer the raw request stream before ANY content-type parser runs.
  // preParsing is properly plugin-scoped and fires before Fastify's default
  // JSON parser, so rawBodyBuffer always contains the exact bytes Meta signed.
  // Emoji in button titles (📦 💳 ⚙️) survive intact — no JSON re-serialisation.
  fastify.addHook("preParsing", (_request, _reply, payload, done) => {
    const chunks: Buffer[] = [];
    payload.on("data", (chunk: unknown) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    payload.on("end", () => {
      const raw = Buffer.concat(chunks);
      (_request.raw as unknown as { rawBodyBuffer: Buffer }).rawBodyBuffer = raw;
      done(null, Readable.from(raw) as unknown as typeof payload);
    });
    payload.on("error", (e: Error) => done(e));
  });

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
      const rawBodyBuffer = (request.raw as unknown as { rawBodyBuffer?: Buffer }).rawBodyBuffer;
      const rawBody = rawBodyBuffer ? rawBodyBuffer.toString("utf8") : JSON.stringify(request.body);
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

          if (change.field !== "messages") continue;

          // Resolve org once for both status updates and inbound messages
          const { phone_number_id } = change.value.metadata;
          const org = await fastify.prisma.organization.findFirst({
            where: { phoneNumberId: phone_number_id },
          });

          // Outbound message status updates (delivered / read) with ratchet protection
          if (change.value.statuses?.length) {
            const TERMINAL = new Set<string>(["read"]);
            const STATUS_RANK: Record<string, number> = { sending: -1, sent: 0, delivered: 1, read: 2 };
            const RECIPIENT_RANK: Record<string, number> = { sent: 0, accepted: 1, delivered: 2, played: 3, read: 4 };
            const RECIPIENT_STATUSES = new Set<string>(["accepted", "delivered", "played", "read", "failed"]);
            const io = getIo();
            for (const su of change.value.statuses) {
              // Update conversation Message if one exists for this wamid
              const msg = await fastify.prisma.message.findFirst({
                where: { whatsappMessageId: su.id },
                select: { id: true, status: true },
              });
              if (msg && !TERMINAL.has(msg.status)) {
                const currentRank = STATUS_RANK[msg.status] ?? -1;
                const newRank = STATUS_RANK[su.status] ?? -1;
                if (newRank > currentRank) {
                  const allowedStatuses: MessageStatus[] = ["sent", "delivered", "read", "failed"];
                  const newStatus = allowedStatuses.includes(su.status as MessageStatus) ? (su.status as MessageStatus) : null;
                  if (newStatus) {
                    await fastify.prisma.message.update({
                      where: { id: msg.id },
                      data: { status: newStatus },
                    });
                    if (org) {
                      io?.to(`org:${org.id}`).emit("message:status", {
                        whatsappMessageId: su.id,
                        status: newStatus,
                      });
                    }
                  }
                }
              }

              // Always update CampaignRecipient if this wamid was sent by a campaign
              if (RECIPIENT_STATUSES.has(su.status)) {
                const recipientStatus = su.status as CampaignRecipientStatus;
                const recipient = await fastify.prisma.campaignRecipient.findFirst({
                  where: { messageId: su.id },
                  select: { id: true, status: true },
                });
                if (recipient) {
                  const currentRecipientRank = RECIPIENT_RANK[recipient.status] ?? -1;
                  const newRecipientRank = RECIPIENT_RANK[recipientStatus] ?? -1;
                  if (newRecipientRank > currentRecipientRank) {
                    await fastify.prisma.campaignRecipient.update({
                      where: { id: recipient.id },
                      data: { status: recipientStatus },
                    });
                  }
                }
              }
            }
          }

          if (!change.value.messages?.length) continue;

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
            } else if (msg.interactive?.button_reply) {
              body = msg.interactive.button_reply.id;
            } else if (msg.interactive?.list_reply) {
              body = msg.interactive.list_reply.id;
            } else if (msg.interactive) {
              body = JSON.stringify(msg.interactive);
            }

            const queued = !!org;
            // Unconditional dump — every message Meta delivers, matched or not
            void fastify.prisma.inboundMessageDump.create({
              data: {
                wamid: msg.id,
                fromPhone: msg.from,
                contentType: msg.type,
                body,
                rawMessage: msg as object,
                orgId: org?.id ?? null,
                queued,
              },
            }).catch(() => { /* dump failures must never block the 200 response */ });

            if (!org) {
              console.log(`[webhook] DROP wamid=${msg.id} from=${msg.from} — no org for phone_number_id=${phone_number_id}`);
              continue;
            }

            console.log(`[webhook] QUEUE wamid=${msg.id} from=${msg.from} type=${msg.type} body=${JSON.stringify(body)} org=${org.id}`);
            await inboundMessageQueue.add("inbound", {
              organizationId: org.id,
              whatsappContactPhone: msg.from,
              whatsappMessageId: msg.id,
              contentType: msg.type,
              body,
              mediaId,
              timestamp: parseInt(msg.timestamp, 10),
            }, { jobId: `wamsg-${msg.id}` });
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
