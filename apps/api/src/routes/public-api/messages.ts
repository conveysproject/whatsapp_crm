import type { FastifyPluginAsync } from "fastify";
import { newApiId, plivoError } from "../../lib/public-api/responses.js";
import {
  parseSendBody, SendValidationError, toMetaInteractive, toMetaTemplateComponents, renderTemplateForInbox,
  type SendContent,
} from "../../lib/public-api/send-mapping.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../../lib/public-api/safe-url.js";
import { publicApiSendQueue, type SendContentForWorker } from "../../lib/public-api/queues.js";
import { enqueueStatusCallback } from "../../lib/public-api/callbacks.js";

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
        await fastify.prisma.apiMessageMeta.create({
          data: { messageId: message.id, apiKeyId, organizationId, dst, callbackUrl, callbackMethod: parsed.callbackMethod },
        });
        await publicApiSendQueue.add("send", { messageId: message.id, organizationId, to: dst, content }, { jobId: `pubsend-${message.id}` });
        await enqueueStatusCallback(fastify.prisma, message.id, "queued");
        uuids.push(message.id);
      }

      return reply.status(202).send({ api_id: newApiId(), message: "message(s) queued", message_uuid: uuids });
    });
  }
};
