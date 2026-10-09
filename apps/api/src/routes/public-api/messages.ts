import type { FastifyPluginAsync } from "fastify";
import { newApiId, apiError } from "../../lib/public-api/responses.js";
import {
  parseSendBody, SendValidationError, NOT_AN_OBJECT_MESSAGE, toMetaInteractive, toMetaTemplateComponents, renderTemplateForInbox, inferMediaKind,
  type SendContent,
} from "../../lib/public-api/send-mapping.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../../lib/public-api/safe-url.js";
import { publicApiSendQueue, type SendContentForWorker } from "../../lib/public-api/queues.js";
import { enqueueStatusCallback, businessNumberDigits } from "../../lib/public-api/callbacks.js";
import { resolveTemplate, validateAgainstTemplate } from "../../lib/public-api/template-validation.js";
import { safeErr } from "../../lib/public-api/safe-err.js";
import { errorMessageForCode } from "../../lib/public-api/meta-errors.js";

const PUBLIC = { config: { public: true } } as const;
const both = (p: string) => [p, p.replace(/\/$/, "")];

function inboxFields(content: SendContentForWorker, templateBody: string | null) {
  switch (content.kind) {
    case "text": return { contentType: "text", body: content.text, mediaUrl: null };
    // The inbox renders image/video/document inline (not a generic "media"), so store the inferred kind.
    case "media": return { contentType: inferMediaKind(content.mediaUrl), body: content.caption, mediaUrl: content.mediaUrl };
    case "template": return { contentType: "template", body: templateBody, mediaUrl: null };
    case "location": return { contentType: "location", body: `📍 Location: ${content.name} (${content.latitude},${content.longitude})`, mediaUrl: null };
    case "interactive": return { contentType: "interactive", body: JSON.stringify(content.interactive), mediaUrl: null };
  }
}

const MAX_LIMIT = 20;
// Prisma `skip` must fit in int32; anything beyond this simply yields an empty page.
const MAX_OFFSET = 2_000_000_000;

/** Normalizes a query value: Fastify yields an array for repeated keys; use the first string. */
function qp(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

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
    error_message: errorMessageForCode(row.errorCode ?? null),
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
        if (err instanceof SendValidationError) {
          // A non-object body (e.g. Content-Type text/plain is parsed to a string) is almost always a wrong Content-Type.
          const hint = err.message === NOT_AN_OBJECT_MESSAGE ? "Send a JSON object with the header Content-Type: application/json." : undefined;
          return apiError(reply, 400, err.code, { message: err.message, ...(hint ? { hint } : {}) });
        }
        throw err;
      }

      const [org, numberRow] = await Promise.all([
        fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
        fastify.prisma.vendorSetting.findFirst({ where: { organizationId, key: "current_phone_number_number" }, select: { value: true } }),
      ]);
      if (!org?.phoneNumberId || !org.wabaAccessToken) return apiError(reply, 400, "WHATSAPP_NOT_CONNECTED");
      const connected = (numberRow?.value ?? "").replace(/\D/g, "");
      if (!connected) return apiError(reply, 400, "WHATSAPP_NOT_CONNECTED");
      if (connected !== parsed.src) return apiError(reply, 400, "SRC_MISMATCH", { hint: `Set src to the connected number (ends in ${connected.slice(-4)}).` });

      if (parsed.callbackUrl) {
        try { await assertSafeCallbackUrl(parsed.callbackUrl); }
        catch (err) {
          if (err instanceof UnsafeUrlError) return apiError(reply, 400, "CALLBACK_URL_INVALID", { message: `url: ${err.message}` });
          throw err;
        }
      }

      // Build the worker payload; template and interactive are resolved/mapped here so bad input fails fast with 400.
      let content: SendContentForWorker;
      let templateBody: string | null = null;
      let templateIdForMessage: string | null = null;
      try {
        const c: SendContent = parsed.content;
        if (c.kind === "template") {
          // Org-scoped by name only: language and status are resolved below so the 400 can say what exists.
          const rows = await fastify.prisma.template.findMany({
            where: { organizationId, name: c.name },
            select: { id: true, name: true, language: true, status: true, components: true, parameterFormat: true },
            take: 50,
          });
          const tpl = resolveTemplate(rows, c.name, c.language);
          validateAgainstTemplate(tpl, c.components);
          templateIdForMessage = tpl.id;
          const stored = (tpl.components ?? []) as unknown[];
          const headerFormat = (stored as Array<{ type?: string; format?: string }>).find((s) => s.type?.toUpperCase() === "HEADER")?.format ?? null;
          content = { kind: "template", name: c.name, language: c.language, components: toMetaTemplateComponents(c.components, headerFormat) };
          templateBody = renderTemplateForInbox(c.name, stored, c.components);
        } else if (c.kind === "interactive") {
          content = { kind: "interactive", interactive: toMetaInteractive(c.interactive) };
        } else {
          content = c;
        }
      } catch (err) {
        if (err instanceof SendValidationError) return apiError(reply, 400, err.code, { message: err.message });
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
              ...(templateIdForMessage ? { templateId: templateIdForMessage, source: "api" } : { source: "api" }),
            },
          });
          messageId = message.id;
          await fastify.prisma.apiMessageMeta.create({
            data: { messageId: message.id, apiKeyId, organizationId, dst, callbackUrl, callbackMethod: parsed.callbackMethod },
          });
          // The queued callback goes BEFORE the send job so the worker's `sent` can never race ahead of it.
          // Best-effort: a failure here must not fail the accepted message.
          try { await enqueueStatusCallback(fastify.prisma, message.id, "queued"); }
          catch (err) { request.log.error({ error: safeErr(err), messageId: message.id }, "public API queued-callback enqueue failed"); }
          await publicApiSendQueue.add("send", { messageId: message.id, organizationId, to: dst, content }, { jobId: `pubsend-${message.id}` });
        } catch (err) {
          // Never log the error object or message: Prisma validation errors echo the query (phone numbers, text).
          request.log.error({ error: safeErr(err), messageId, organizationId }, "public API send failed for a destination");
          if (messageId) {
            try {
              await fastify.prisma.message.update({ where: { id: messageId, organizationId }, data: { status: "failed" } });
              // A queued callback may already have gone out; close it (a no-op when no API metadata row exists).
              await enqueueStatusCallback(fastify.prisma, messageId, "failed", { errorCode: null });
            } catch { /* best-effort cleanup */ }
          }
          continue;
        }
        uuids.push(messageId);
      }

      if (uuids.length === 0) return apiError(reply, 500, "QUEUE_FAILED");
      request.usageMessages = uuids.length;
      return reply.status(202).send({ api_id: request.apiId ?? newApiId(), message: "message(s) queued", message_uuid: uuids });
    });
  }

  for (const path of both("/Message/")) {
    fastify.get<{ Params: { authId: string }; Querystring: Record<string, unknown> }>(path, PUBLIC, async (request, reply) => {
      const { organizationId } = request.publicApi!;
      const q = request.query;
      const limit = Math.min(Math.max(parseInt(qp(q["limit"]) ?? "", 10) || MAX_LIMIT, 1), MAX_LIMIT);
      const offset = Math.min(Math.max(parseInt(qp(q["offset"]) ?? "", 10) || 0, 0), MAX_OFFSET);
      const direction = qp(q["message_direction"]);
      const type = qp(q["message_type"]);
      const state = qp(q["message_state"]);
      const errorCode = qp(q["error_code"]);
      const gtRaw = qp(q["message_time__gt"]);
      const ltRaw = qp(q["message_time__lt"]);
      const gt = parseTime(gtRaw);
      const lt = parseTime(ltRaw);
      if (gt === "invalid" || lt === "invalid") return apiError(reply, 400, "VALIDATION_FAILED", { message: "message_time filters must be yyyy-MM-dd HH:mm:ss", hint: "Send message_time__gt and message_time__lt as yyyy-MM-dd HH:mm:ss, for example 2026-10-05 00:00:00." });

      const base = `/v1/Account/${request.params.authId}/Message/`;
      const link = (newOffset: number) => {
        const sp = new URLSearchParams();
        const filters: Array<[string, string | undefined]> = [
          ["message_direction", direction], ["message_type", type], ["message_state", state], ["error_code", errorCode],
          ["message_time__gt", gtRaw], ["message_time__lt", ltRaw], ["subaccount", qp(q["subaccount"])],
        ];
        for (const [k, v] of filters) if (v) sp.set(k, v);
        sp.set("limit", String(limit));
        sp.set("offset", String(newOffset));
        return `${base}?${sp.toString()}`;
      };
      const meta = (total: number) => ({
        limit, offset, total_count: total,
        previous: offset > 0 ? link(Math.max(offset - limit, 0)) : null,
        next: offset + limit < total ? link(offset + limit) : null,
      });

      if (direction === "inbound" || (type && type !== "whatsapp")) {
        return reply.send({ api_id: request.apiId ?? newApiId(), meta: meta(0), objects: [] });
      }

      const where = {
        organizationId,
        ...(state ? { lastStatus: state } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(gt || lt ? { queuedAt: { ...(gt ? { gt } : {}), ...(lt ? { lt } : {}) } } : {}),
      };
      const [rows, total, from] = await Promise.all([
        fastify.prisma.apiMessageMeta.findMany({
          where, orderBy: [{ queuedAt: "desc" as const }, { messageId: "desc" as const }], skip: offset, take: limit,
          include: { message: { select: { id: true, status: true } } },
        }),
        fastify.prisma.apiMessageMeta.count({ where }),
        businessNumberDigits(fastify.prisma, organizationId),
      ]);
      return reply.send({ api_id: request.apiId ?? newApiId(), meta: meta(total), objects: rows.map((r) => toMessageObject(r, from)) });
    });
  }

  for (const path of both("/Message/:uuid/")) {
    fastify.get<{ Params: { authId: string; uuid: string } }>(path, PUBLIC, async (request, reply) => {
      const { organizationId } = request.publicApi!;
      const row = await fastify.prisma.apiMessageMeta.findFirst({
        where: { messageId: request.params.uuid, organizationId },
        include: { message: { select: { id: true, status: true } } },
      });
      if (!row) return apiError(reply, 404, "MESSAGE_NOT_FOUND");
      const from = await businessNumberDigits(fastify.prisma, organizationId);
      return reply.send({ api_id: request.apiId ?? newApiId(), ...toMessageObject(row, from) });
    });
  }
};
