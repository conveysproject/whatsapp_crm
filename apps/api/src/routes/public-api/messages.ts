import type { FastifyPluginAsync } from "fastify";
import { newApiId, plivoError } from "../../lib/public-api/responses.js";
import {
  parseSendBody, SendValidationError, toMetaInteractive, toMetaTemplateComponents, renderTemplateForInbox,
  type SendContent,
} from "../../lib/public-api/send-mapping.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../../lib/public-api/safe-url.js";
import { publicApiSendQueue, type SendContentForWorker } from "../../lib/public-api/queues.js";
import { enqueueStatusCallback, businessNumberDigits } from "../../lib/public-api/callbacks.js";

const PUBLIC = { config: { public: true } } as const;
const both = (p: string) => [p, p.replace(/\/$/, "")];

function inboxFields(content: SendContentForWorker, templateBody: string | null) {
  switch (content.kind) {
    case "text": return { contentType: "text", body: content.text, mediaUrl: null };
    case "media": return { contentType: "media", body: content.caption, mediaUrl: content.mediaUrl };
    case "template": return { contentType: "template", body: templateBody, mediaUrl: null };
    case "location": return { contentType: "location", body: `📍 Location: ${content.name} (${content.latitude},${content.longitude})`, mediaUrl: null };
    case "interactive": return { contentType: "interactive", body: JSON.stringify(content.interactive), mediaUrl: null };
  }
}

const MAX_LIMIT = 20;

function plivoMessageTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")}+00:00`;
}

function parseTime(v: string | undefined): Date | null | "invalid" {
  if (!v) return null;
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function toMessageObject(
  row: { messageId: string; dst: string; lastStatus: string | null; errorCode: string | null; queuedAt: Date; message: { status: string } },
  from: string
) {
  return {
    message_uuid: row.messageId,
    message_direction: "outbound",
    message_state: row.lastStatus ?? row.message.status,
    message_type: "whatsapp",
    message_time: plivoMessageTime(row.queuedAt),
    from_number: from,
    to_number: row.dst,
    units: 1,
    total_rate: "0",
    total_amount: "0",
    error_code: row.errorCode ? Number(row.errorCode) : null,
    conversation_id: null,
    conversation_origin: null,
  };
}

export const publicApiMessagesRouter: FastifyPluginAsync = async (fastify) => {
  for (const path of both("/Message/")) {
    fastify.post<{ Params: { authId: string }; Body: unknown }>(path, PUBLIC, async (request, reply) => {
      const { organizationId, apiKeyId } = request.publicApi!;

      let parsed;
      try { parsed = parseSendBody(request.body); }
      catch (err) {
        if (err instanceof SendValidationError) return plivoError(reply, 400, err.message);
        throw err;
      }

      const [org, numberRow] = await Promise.all([
        fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
        fastify.prisma.vendorSetting.findFirst({ where: { organizationId, key: "current_phone_number_number" }, select: { value: true } }),
      ]);
      if (!org?.phoneNumberId || !org.wabaAccessToken) return plivoError(reply, 400, "WhatsApp number is not connected");
      const connected = (numberRow?.value ?? "").replace(/\D/g, "");
      if (!connected || connected !== parsed.src) return plivoError(reply, 400, "src is not the WhatsApp Business number of this account");

      if (parsed.callbackUrl) {
        try { await assertSafeCallbackUrl(parsed.callbackUrl); }
        catch (err) {
          if (err instanceof UnsafeUrlError) return plivoError(reply, 400, `url: ${err.message}`);
          throw err;
        }
      }

      // Build the worker payload; template and interactive are resolved/mapped here so bad input fails fast with 400.
      let content: SendContentForWorker;
      let templateBody: string | null = null;
      try {
        const c: SendContent = parsed.content;
        if (c.kind === "template") {
          const found = await fastify.prisma.template.findMany({
            where: { organizationId, name: c.name, language: c.language, status: "approved" },
            select: { name: true, language: true, components: true },
            take: 2,
          });
          if (found.length === 0) throw new SendValidationError("Template not found or not approved");
          if (found.length > 1) throw new SendValidationError("Template name and language match more than one template");
          const stored = (found[0]!.components ?? []) as unknown[];
          const headerFormat = (stored as Array<{ type?: string; format?: string }>).find((s) => s.type?.toUpperCase() === "HEADER")?.format ?? null;
          content = { kind: "template", name: c.name, language: c.language, components: toMetaTemplateComponents(c.components, headerFormat) };
          templateBody = renderTemplateForInbox(c.name, stored, c.components);
        } else if (c.kind === "interactive") {
          content = { kind: "interactive", interactive: toMetaInteractive(c.interactive) };
        } else {
          content = c;
        }
      } catch (err) {
        if (err instanceof SendValidationError) return plivoError(reply, 400, err.message);
        throw err;
      }

      const fields = inboxFields(content, templateBody);
      const callbackUrl = parsed.callbackUrl ?? null; // per-message override only; the credential default is resolved at callback time
      const uuids: string[] = [];
      for (const dst of parsed.dsts) {
        let messageId: string | null = null;
        try {
          const contact = await fastify.prisma.contact.upsert({
            where: { organizationId_phoneNumber: { organizationId, phoneNumber: dst } },
            create: { organizationId, phoneNumber: dst },
            update: {},
            select: { id: true },
          });
          let conversation = await fastify.prisma.conversation.findFirst({ where: { organizationId, whatsappContactId: dst } });
          if (!conversation) {
            conversation = await fastify.prisma.conversation.create({
              data: { organizationId, contactId: contact.id, whatsappContactId: dst, channelType: "whatsapp", status: "open" },
            });
          }
          const message = await fastify.prisma.message.create({
            data: {
              conversationId: conversation.id, organizationId, direction: "outbound",
              contentType: fields.contentType, body: fields.body, mediaUrl: fields.mediaUrl, status: "sending",
            },
          });
          messageId = message.id;
          await fastify.prisma.apiMessageMeta.create({
            data: { messageId: message.id, apiKeyId, organizationId, dst, callbackUrl, callbackMethod: parsed.callbackMethod },
          });
          await publicApiSendQueue.add("send", { messageId: message.id, organizationId, to: dst, content }, { jobId: `pubsend-${message.id}` });
        } catch (err) {
          request.log.error({ err, messageId, organizationId }, "public API send failed for a destination");
          if (messageId) {
            try { await fastify.prisma.message.update({ where: { id: messageId, organizationId }, data: { status: "failed" } }); }
            catch { /* best-effort cleanup */ }
          }
          continue;
        }
        uuids.push(messageId);
        // The queued callback is best-effort: the message is already accepted and queued.
        try { await enqueueStatusCallback(fastify.prisma, messageId, "queued"); }
        catch (err) { request.log.error({ err, messageId }, "public API queued-callback enqueue failed"); }
      }

      if (uuids.length === 0) return plivoError(reply, 500, "Failed to queue message");
      return reply.status(202).send({ api_id: newApiId(), message: "message(s) queued", message_uuid: uuids });
    });
  }

  for (const path of both("/Message/")) {
    fastify.get<{ Params: { authId: string }; Querystring: Record<string, string | undefined> }>(path, PUBLIC, async (request, reply) => {
      const { organizationId } = request.publicApi!;
      const q = request.query;
      const limit = Math.min(Math.max(parseInt(q["limit"] ?? "", 10) || MAX_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(parseInt(q["offset"] ?? "", 10) || 0, 0);
      const gt = parseTime(q["message_time__gt"]);
      const lt = parseTime(q["message_time__lt"]);
      if (gt === "invalid" || lt === "invalid") return plivoError(reply, 400, "message_time filters must be yyyy-MM-dd HH:mm:ss");

      const base = `/v1/Account/${request.params.authId}/Message/`;
      const meta = (total: number) => ({
        limit, offset, total_count: total,
        previous: offset > 0 ? `${base}?limit=${limit}&offset=${Math.max(offset - limit, 0)}` : null,
        next: offset + limit < total ? `${base}?limit=${limit}&offset=${offset + limit}` : null,
      });

      if (q["message_direction"] === "inbound" || (q["message_type"] && q["message_type"] !== "whatsapp")) {
        return reply.send({ api_id: newApiId(), meta: meta(0), objects: [] });
      }

      const where = {
        organizationId,
        ...(q["message_state"] ? { lastStatus: q["message_state"] } : {}),
        ...(q["error_code"] ? { errorCode: q["error_code"] } : {}),
        ...(gt || lt ? { queuedAt: { ...(gt ? { gt } : {}), ...(lt ? { lt } : {}) } } : {}),
      };
      const [rows, total, from] = await Promise.all([
        fastify.prisma.apiMessageMeta.findMany({
          where, orderBy: { queuedAt: "desc" }, skip: offset, take: limit,
          include: { message: { select: { id: true, status: true } } },
        }),
        fastify.prisma.apiMessageMeta.count({ where }),
        businessNumberDigits(fastify.prisma, organizationId),
      ]);
      return reply.send({ api_id: newApiId(), meta: meta(total), objects: rows.map((r) => toMessageObject(r, from)) });
    });
  }

  for (const path of both("/Message/:uuid/")) {
    fastify.get<{ Params: { authId: string; uuid: string } }>(path, PUBLIC, async (request, reply) => {
      const { organizationId } = request.publicApi!;
      const row = await fastify.prisma.apiMessageMeta.findFirst({
        where: { messageId: request.params.uuid, organizationId },
        include: { message: { select: { id: true, status: true } } },
      });
      if (!row) return plivoError(reply, 404, "not found");
      const from = await businessNumberDigits(fastify.prisma, organizationId);
      return reply.send({ api_id: newApiId(), ...toMessageObject(row, from) });
    });
  }
};
