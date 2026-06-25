import type { FastifyPluginAsync } from "fastify";
import { sendTextMessage, sendMediaMessage, sendInteractiveMessage, sendTemplateMessage } from "../lib/whatsapp.js";
import type { WaInteractivePayload } from "../lib/whatsapp.js";
import { buildTemplateComponents, contactBodyVars } from "../lib/template-components.js";
import type { ConversationId } from "@WBMSG/shared";
import { canAccess } from "../lib/permissions.js";
import { cancelNoReplyJobs } from "../lib/trigger-dispatcher.js";
import { cancelDelayedResponseJob } from "../lib/automation-trigger.js";
import { getIo } from "../lib/io-ref.js";
import { inboundMessageQueue } from "../lib/queue.js";

type SendMessageBody =
  | { contentType?: "text"; text: string }
  | { contentType: "image" | "video" | "document" | "audio"; mediaId: string; mimeType?: string; filename?: string; caption?: string }
  | { contentType: "interactive"; interactive: WaInteractivePayload }
  | { contentType: "template"; templateId: string; mediaUrl?: string; cardMediaUrls?: string[] };

export const messagesRouter: FastifyPluginAsync = async (fastify) => {
  // Section gate (Phase 2 / D15): messages routes require inbox_access.
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccess(role, permissions, "inbox_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "inbox_access permission required" } });
    }
  });

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
        // Use start of next day so "to=2026-05-26" includes all messages on May 26
        ...(to ? { lt: new Date(new Date(to).getTime() + 86400000) } : {}),
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

  // ── Message gaps: dumps received but never stored in messages table ────────
  fastify.get<{ Querystring: { from?: string; to?: string; page?: string } }>(
    "/messages/gaps",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { from, to, page } = request.query;
      const pageNum = Math.max(1, parseInt(page ?? "1", 10));
      const pageSize = 50;
      const offset = (pageNum - 1) * pageSize;
      const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
      const toDate = to ? new Date(new Date(to).getTime() + 86400000) : new Date();

      type GapRow = { id: string; wamid: string; from_phone: string; content_type: string; body: string | null; queued: boolean; created_at: Date };
      const [rows, countRows] = await Promise.all([
        fastify.prisma.$queryRaw<GapRow[]>`
          SELECT d.id, d.wamid, d.from_phone, d.content_type, d.body, d.queued, d.created_at
          FROM inbound_message_dumps d
          LEFT JOIN messages m ON m.whatsapp_message_id = d.wamid
          WHERE d.org_id = ${organizationId}
            AND m.id IS NULL
            AND d.created_at >= ${fromDate}
            AND d.created_at < ${toDate}
          ORDER BY d.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        fastify.prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) AS count
          FROM inbound_message_dumps d
          LEFT JOIN messages m ON m.whatsapp_message_id = d.wamid
          WHERE d.org_id = ${organizationId}
            AND m.id IS NULL
            AND d.created_at >= ${fromDate}
            AND d.created_at < ${toDate}
        `,
      ]);

      return reply.send({
        data: rows.map((r) => ({
          id: r.id,
          wamid: r.wamid,
          fromPhone: r.from_phone,
          contentType: r.content_type,
          body: r.body,
          queued: r.queued,
          createdAt: r.created_at,
        })),
        total: Number(countRows[0]?.count ?? 0),
        page: pageNum,
      });
    }
  );

  // ── Re-queue gap messages back into the inbound worker pipeline ────────────
  fastify.post<{ Body: { wamids?: string[]; all?: boolean } }>(
    "/messages/gaps/requeue",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { wamids, all } = request.body;

      type DumpRow = { id: string; wamid: string; from_phone: string; content_type: string; body: string | null; raw_message: unknown; org_id: string | null };
      let dumps: DumpRow[];

      if (all) {
        dumps = await fastify.prisma.$queryRaw<DumpRow[]>`
          SELECT d.id, d.wamid, d.from_phone, d.content_type, d.body, d.raw_message, d.org_id
          FROM inbound_message_dumps d
          LEFT JOIN messages m ON m.whatsapp_message_id = d.wamid
          WHERE d.org_id = ${organizationId} AND m.id IS NULL
          LIMIT 500
        `;
      } else {
        if (!wamids?.length) return reply.send({ queued: 0 });
        const rows = await fastify.prisma.inboundMessageDump.findMany({
          where: { wamid: { in: wamids }, orgId: organizationId },
        });
        dumps = rows.map((r) => ({
          id: r.id, wamid: r.wamid, from_phone: r.fromPhone,
          content_type: r.contentType, body: r.body,
          raw_message: r.rawMessage, org_id: r.orgId,
        }));
      }

      let queued = 0;
      for (const dump of dumps) {
        const raw = dump.raw_message as { timestamp?: string; image?: { id: string }; video?: { id: string }; audio?: { id: string }; document?: { id: string }; sticker?: { id: string }; voice?: { id: string } };
        const mediaId = raw.image?.id ?? raw.video?.id ?? raw.audio?.id ?? raw.document?.id ?? raw.sticker?.id ?? raw.voice?.id ?? null;
        const timestamp = parseInt(raw.timestamp ?? "0", 10) || Math.floor(Date.now() / 1000);
        await inboundMessageQueue.add("inbound", {
          organizationId: dump.org_id ?? organizationId,
          whatsappContactPhone: dump.from_phone,
          whatsappMessageId: dump.wamid,
          contentType: dump.content_type,
          body: dump.body,
          mediaId,
          timestamp,
        }, { jobId: `wamsg-${dump.wamid}` });
        queued++;
      }

      return reply.send({ queued });
    }
  );

  fastify.post<{ Params: { id: ConversationId }; Body: SendMessageBody }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      // GAP-S04: inbox_access permission required to send messages
      if (!canAccess(role, permissions, "inbox_access")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "inbox_access permission required" } });
      }
      const body = request.body;

      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
        include: {
          organization: { select: { phoneNumberId: true, wabaAccessToken: true } },
          contact: { select: { firstName: true, lastName: true, phoneNumber: true, email: true } },
        },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      if (!conversation.whatsappContactId) {
        return reply.status(400).send({ error: { code: "NO_WA_CONTACT", message: "No WhatsApp contact on this conversation" } });
      }

      const phoneNumberId = conversation.organization?.phoneNumberId ?? "";
      const accessToken = conversation.organization?.wabaAccessToken ?? "";
      if (!phoneNumberId || !accessToken) {
        return reply.status(400).send({ error: { code: "WHATSAPP_NOT_CONNECTED", message: "WhatsApp account not connected" } });
      }

      const contentType = body.contentType ?? "text";

      // ── Template branch — resolve before creating draft ────────────────────
      if (contentType === "template") {
        const tplBody = body as { contentType: "template"; templateId: string; mediaUrl?: string; cardMediaUrls?: string[] };
        const template = await fastify.prisma.template.findFirst({
          where: { id: tplBody.templateId, organizationId },
        });
        if (!template) {
          return reply.status(404).send({ error: { code: "TEMPLATE_NOT_FOUND", message: "Template not found" } });
        }
        if (template.status !== "approved") {
          return reply.status(400).send({ error: { code: "TEMPLATE_NOT_APPROVED", message: "Only approved templates can be sent" } });
        }

        type StoredComp = { type?: string; format?: string; text?: string; example?: { header_url?: string[]; header_text?: string[]; body_text?: string[][] }; cards?: Array<{ components?: StoredComp[] }> };
        let stored = (template.components ?? []) as StoredComp[];

        const storedHeader = stored.find((c) => c.type?.toUpperCase() === "HEADER");
        const headerNeedsMedia = storedHeader &&
          ["IMAGE", "VIDEO", "DOCUMENT"].includes((storedHeader.format ?? "").toUpperCase()) &&
          !storedHeader.example?.header_url?.[0];

        if (headerNeedsMedia && template.metaTemplateId) {
          const metaRes = await fetch(
            `https://graph.facebook.com/v25.0/${template.metaTemplateId}?fields=components`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (metaRes.ok) {
            const metaData = await metaRes.json() as { components?: StoredComp[] };
            const metaHeader = (metaData.components ?? []).find((c) => c.type?.toUpperCase() === "HEADER");
            if (metaHeader?.example?.header_url?.[0]) {
              stored = stored.map((c) =>
                c.type?.toUpperCase() === "HEADER" ? { ...c, example: metaHeader.example } : c
              );
              await fastify.prisma.template.update({
                where: { id: template.id },
                data: { components: stored as object[] },
              });
            }
          }
        }

        // Inject caller-supplied mediaUrl into the stored header so buildTemplateComponents picks it up
        if (tplBody.mediaUrl) {
          stored = stored.map((c) =>
            c.type?.toUpperCase() === "HEADER"
              ? { ...c, example: { ...(c.example ?? {}), header_url: [tplBody.mediaUrl!] } }
              : c
          );
        }

        const resolvedHeader = stored.find((c) => c.type?.toUpperCase() === "HEADER");
        if (
          resolvedHeader &&
          ["IMAGE", "VIDEO", "DOCUMENT"].includes((resolvedHeader.format ?? "").toUpperCase()) &&
          !resolvedHeader.example?.header_url?.[0]
        ) {
          return reply.status(400).send({
            error: { code: "MEDIA_REQUIRED", message: `Template "${template.name}" has an ${resolvedHeader.format} header. Please provide a media URL.` },
          });
        }

        const carouselComp = stored.find((c) => (c.type ?? "").toUpperCase() === "CAROUSEL");
        if (carouselComp) {
          const imageCardCount = (carouselComp.cards ?? []).filter((card) =>
            (card.components ?? []).some((cc) =>
              (cc.type ?? "").toUpperCase() === "HEADER" &&
              ["IMAGE", "VIDEO", "DOCUMENT"].includes((cc.format ?? "").toUpperCase())
            )
          ).length;
          if (imageCardCount > 0 && (tplBody.cardMediaUrls ?? []).length !== imageCardCount) {
            return reply.status(400).send({
              error: {
                code: "MEDIA_REQUIRED",
                message: `Template "${template.name}" has a carousel with ${imageCardCount} image card(s). Provide cardMediaUrls with exactly ${imageCardCount} entries.`,
              },
            });
          }
        }

        const bodyComp = stored.find((c) => c.type?.toUpperCase() === "BODY");
        const varCount = bodyComp?.text ? (bodyComp.text.match(/\{\{\d+\}\}/g) ?? []).length : 0;
        const contact = conversation.contact;
        const bodyVars = contact
          ? contactBodyVars({ firstName: contact.firstName, lastName: contact.lastName, phoneNumber: contact.phoneNumber, email: contact.email }, varCount)
          : [];

        const headerTextComp = stored.find(
          (c) => c.type?.toUpperCase() === "HEADER" && (c.format ?? "TEXT").toUpperCase() === "TEXT"
        );
        const headerVarCount = headerTextComp?.text
          ? (headerTextComp.text.match(/\{\{\d+\}\}/g) ?? []).length
          : 0;
        const headerVars = contact && headerVarCount > 0
          ? contactBodyVars({ firstName: contact.firstName, lastName: contact.lastName, phoneNumber: contact.phoneNumber, email: contact.email }, headerVarCount)
          : [];

        const cardVars = tplBody.cardMediaUrls?.map((url) => ({ headerMediaUrl: url }));
        const components = buildTemplateComponents(stored as unknown[], {
          header: headerVars,
          body: bodyVars,
          ...(cardVars ? { cards: cardVars } : {}),
        });

        // Build rendered body JSON for inbox display (same as send-to-contact)
        type WaComp = { type?: string; format?: string; text?: string; example?: { header_url?: string[] }; buttons?: Array<{ type?: string; text?: string }>; cards?: Array<{ components?: WaComp[] }> };
        const comps = stored as WaComp[];
        const headerComp = comps.find((c) => c.type?.toUpperCase() === "HEADER");
        const footerComp = comps.find((c) => c.type?.toUpperCase() === "FOOTER");
        const buttonsComp = comps.find((c) => c.type?.toUpperCase() === "BUTTONS");
        const carouselRendComp = comps.find((c) => c.type?.toUpperCase() === "CAROUSEL");
        let bodyText = bodyComp?.text ?? "";
        bodyVars.forEach((v, i) => { bodyText = bodyText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), v); });
        const isMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes((headerComp?.format ?? "").toUpperCase());
        const msgCardUrls = tplBody.cardMediaUrls ?? [];
        const carouselCards = carouselRendComp
          ? (carouselRendComp.cards ?? []).map((card, i) => {
              const cc = card.components ?? [];
              const cardHeader = cc.find((c) => c.type?.toUpperCase() === "HEADER");
              const cardBody = cc.find((c) => c.type?.toUpperCase() === "BODY");
              const cardBtns = cc.find((c) => c.type?.toUpperCase() === "BUTTONS");
              return {
                headerFormat: cardHeader?.format ?? null,
                headerMediaUrl: msgCardUrls[i] ?? null,
                body: cardBody?.text ?? null,
                buttons: cardBtns?.buttons ?? [],
              };
            })
          : null;
        const renderedBody = JSON.stringify({
          templateName: template.name,
          header: headerComp ? {
            format: headerComp.format ?? "TEXT",
            text: headerComp.text ?? null,
            mediaUrl: isMediaHeader ? (headerComp.example?.header_url?.[0] ?? null) : null,
          } : null,
          body: bodyText || template.name,
          footer: footerComp?.text ?? null,
          buttons: buttonsComp?.buttons ?? [],
          carousel: carouselCards,
        });

        const draft = await fastify.prisma.message.create({
          data: { conversationId: conversation.id, organizationId, direction: "outbound", contentType: "template", body: renderedBody, status: "sending" },
        });

        let messageId: string;
        try {
          ({ messageId } = await sendTemplateMessage(phoneNumberId, conversation.whatsappContactId, template.name, template.language, components, accessToken));
        } catch (err) {
          await fastify.prisma.message.update({ where: { id: draft.id }, data: { status: "failed" } });
          throw err;
        }

        const message = await fastify.prisma.message.update({ where: { id: draft.id }, data: { status: "sent", whatsappMessageId: messageId } });
        await fastify.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
        getIo()?.to(`org:${organizationId}`).emit("new-message", { conversationId: conversation.id, organizationId, direction: "outbound", body: renderedBody, sentAt: message.sentAt.toISOString() });
        return reply.status(201).send({ data: message });
      }

      // Determine storedBody before WA call so we can create the record first
      let storedBody: string | null = null;
      if (contentType === "text") {
        const textBody = body as { contentType?: "text"; text: string };
        if (!textBody.text?.trim()) {
          return reply.status(400).send({ error: { code: "MISSING_TEXT", message: "text is required for text messages" } });
        }
        storedBody = textBody.text.trim();
      } else if (contentType === "interactive") {
        const intBody = body as { contentType: "interactive"; interactive: WaInteractivePayload };
        if (!intBody.interactive) {
          return reply.status(400).send({ error: { code: "MISSING_INTERACTIVE", message: "interactive payload required" } });
        }
        storedBody = JSON.stringify(intBody.interactive);
      } else {
        const mediaBody = body as { contentType: "image" | "video" | "document" | "audio"; mediaId: string; caption?: string };
        if (!mediaBody.mediaId) {
          return reply.status(400).send({ error: { code: "MISSING_MEDIA_ID", message: "mediaId is required for media messages" } });
        }
        storedBody = mediaBody.caption ?? null;
      }

      // Cancel pending no-reply checks — agent is replying
      void cancelNoReplyJobs(conversation.id);
      // Cancel any pending delayed-response job — agent replied before it fired
      void cancelDelayedResponseJob(conversation.id);

      // Store a stable wamid: reference for media so the inbox can proxy it
      // via /api/v1/media/:id — avoids storing the expiring WhatsApp CDN URL.
      let outboundMediaUrl: string | null = null;
      if (contentType !== "text" && contentType !== "interactive") {
        const mediaBody = body as { mediaId: string };
        outboundMediaUrl = mediaBody.mediaId.startsWith("https://")
          ? mediaBody.mediaId
          : `wamid:${mediaBody.mediaId}`;
      }

      // Create record with "sending" status before WA call for stuck-message recovery
      const draft = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType,
          body: storedBody,
          status: "sending",
          ...(outboundMediaUrl ? { mediaUrl: outboundMediaUrl } : {}),
          // interactive messages must always be agent-visible, never hidden as system messages
          ...(contentType === "interactive" ? { isSystemMessage: false } : {}),
        },
      });

      let messageId: string;
      try {
        if (contentType === "text") {
          const textBody = body as { contentType?: "text"; text: string };
          const result = await sendTextMessage(phoneNumberId, conversation.whatsappContactId, textBody.text.trim(), accessToken);
          messageId = result.messageId;
        } else if (contentType === "interactive") {
          const intBody = body as { contentType: "interactive"; interactive: WaInteractivePayload };
          const result = await sendInteractiveMessage(phoneNumberId, conversation.whatsappContactId, intBody.interactive, accessToken);
          messageId = result.messageId;
        } else {
          const mediaBody = body as { contentType: "image" | "video" | "document" | "audio"; mediaId: string; caption?: string };
          const result = await sendMediaMessage(
            phoneNumberId,
            conversation.whatsappContactId,
            contentType,
            mediaBody.mediaId,
            mediaBody.caption,
            accessToken
          );
          messageId = result.messageId;
        }
      } catch (err) {
        await fastify.prisma.message.update({ where: { id: draft.id }, data: { status: "failed" } });
        throw err;
      }

      const message = await fastify.prisma.message.update({
        where: { id: draft.id },
        data: { status: "sent", whatsappMessageId: messageId },
      });

      await fastify.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      getIo()?.to(`org:${organizationId}`).emit("new-message", { conversationId: conversation.id, organizationId, direction: "outbound", body: storedBody, sentAt: message.sentAt.toISOString() });

      return reply.status(201).send({ data: message });
    }
  );
};
