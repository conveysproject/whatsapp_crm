import type { FastifyPluginAsync } from "fastify";
import type { TemplateCategory, TemplateStatus } from "@prisma/client";
import { submitTemplateToMeta } from "../lib/meta-templates.js";
import { sendTemplateMessage } from "../lib/whatsapp.js";
import { buildTemplateComponents, contactBodyVars } from "../lib/template-components.js";
import type { TemplateId, ContactId } from "@WBMSG/shared";
import { canAccess, hasSubPermission } from "../lib/permissions.js";

interface TemplateBody {
  name: string;
  category: TemplateCategory;
  language: string;
  components: object[];
}

interface SendToContactBody {
  contactId: ContactId;
  variables: string[];
}

export const templatesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/templates", async (request, reply) => {
    const { organizationId } = request.auth;
    const templates = await fastify.prisma.template.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: templates });
  });

  fastify.get<{ Params: { id: TemplateId } }>("/templates/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!template) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
    }
    return reply.send({ data: template });
  });

  fastify.post<{ Body: TemplateBody }>("/templates", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    // GAP-S04: manage_templates + add_edit_templates sub-permission required to create templates
    if (!canAccess(role, permissions, "manage_templates")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_templates permission required" } });
    }
    if (!hasSubPermission(permissions, "manage_templates", "add_edit_templates")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "add_edit_templates permission required" } });
    }
    const template = await fastify.prisma.template.create({
      data: {
        organizationId,
        name: request.body.name,
        category: request.body.category,
        language: request.body.language,
        components: request.body.components,
        status: "pending" as TemplateStatus,
      },
    });
    return reply.status(201).send({ data: template });
  });

  fastify.post<{ Params: { id: TemplateId } }>("/templates/:id/submit", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!template) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
    }

    const org = await fastify.prisma.organization.findFirst({ where: { id: organizationId } });
    if (!org?.whatsappBusinessAccountId) {
      return reply.status(400).send({ error: { code: "NO_WABA", message: "Organization has no WhatsApp Business Account configured" } });
    }

    const { metaTemplateId } = await submitTemplateToMeta({
      wabaId: org.whatsappBusinessAccountId,
      accessToken: process.env["WA_ACCESS_TOKEN"] ?? "",
      name: template.name,
      category: template.category,
      language: template.language,
      components: template.components as unknown as Parameters<typeof submitTemplateToMeta>[0]["components"],
    });

    const updated = await fastify.prisma.template.update({
      where: { id: template.id },
      data: { metaTemplateId, status: "pending" as TemplateStatus },
    });

    return reply.send({ data: updated });
  });

  fastify.patch<{ Params: { id: TemplateId }; Body: Partial<TemplateBody> }>(
    "/templates/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.template.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
      }
      const template = await fastify.prisma.template.update({
        where: { id: request.params.id },
        data: {
          name: request.body.name,
          category: request.body.category,
          language: request.body.language,
          components: request.body.components,
        },
      });
      return reply.send({ data: template });
    }
  );

  fastify.get<{ Params: { id: TemplateId } }>("/templates/:id/analytics", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!template) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
    }

    const rows = await fastify.prisma.message.groupBy({
      by: ["status"],
      where: { organizationId, direction: "outbound", contentType: "template", body: template.name },
      _count: { status: true },
    });

    const stats: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const row of rows) {
      stats[row.status] = row._count.status;
    }

    const delivered = stats["delivered"] ?? 0;
    const read = stats["read"] ?? 0;
    // GAP-S21: readPercentage = (read / delivered) × 100, capped at 100, rounded
    const readPercentage = delivered > 0 ? Math.min(100, Math.round((read / delivered) * 100)) : 0;
    return reply.send({
      data: {
        sent: stats["sent"] ?? 0,
        delivered,
        read,
        failed: stats["failed"] ?? 0,
        readPercentage,
      },
    });
  });

  fastify.delete<{ Params: { id: TemplateId } }>("/templates/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    // GAP-S04: manage_templates + delete_templates sub-permission required
    if (!canAccess(role, permissions, "manage_templates")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_templates permission required" } });
    }
    if (!hasSubPermission(permissions, "manage_templates", "delete_templates")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "delete_templates permission required" } });
    }
    const template = await fastify.prisma.template.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!template) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
    }
    if (template.metaTemplateId) {
      const org = await fastify.prisma.organization.findFirst({ where: { id: organizationId } });
      const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";
      try {
        await fetch(`https://graph.facebook.com/v25.0/${template.metaTemplateId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch { /* non-critical */ }
    }
    await fastify.prisma.template.delete({ where: { id: template.id } });
    return reply.status(204).send();
  });

  fastify.post("/templates/sync", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findFirst({ where: { id: organizationId } });
    if (!org?.whatsappBusinessAccountId) {
      return reply.status(400).send({ error: { code: "NO_WABA", message: "No WhatsApp Business Account configured" } });
    }
    const accessToken = org.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${org.whatsappBusinessAccountId}/message_templates?limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return reply.status(400).send({ error: { code: "META_ERROR", message: "Failed to fetch templates from Meta" } });
    const json = await res.json() as { data: { id: string; name: string; status: string; category: string; language: string; components: unknown[] }[] };
    let synced = 0;
    for (const t of json.data ?? []) {
      const lang = t.language ?? "en";
      const existing = await fastify.prisma.template.findFirst({
        where: { organizationId, name: t.name, language: lang },
      });
      const statusVal = (t.status?.toLowerCase() ?? "pending") as "approved" | "pending" | "rejected";
      const componentsVal = (t.components ?? []) as object[];
      if (existing) {
        await fastify.prisma.template.update({
          where: { id: existing.id },
          data: { status: statusVal, components: componentsVal, metaTemplateId: t.id },
        });
      } else {
        await fastify.prisma.template.create({
          data: {
            organizationId,
            name: t.name,
            category: ((t.category?.toLowerCase() ?? "utility") as "utility" | "marketing" | "authentication"),
            language: lang,
            status: statusVal,
            components: componentsVal,
            metaTemplateId: t.id,
          },
        });
      }
      synced++;
    }
    return reply.send({ data: { synced } });
  });

  fastify.post<{ Params: { id: TemplateId }; Body: SendToContactBody }>(
    "/templates/:id/send-to-contact",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const template = await fastify.prisma.template.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!template) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
      }

      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.body.contactId, organizationId },
      });
      if (!contact) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }

      if (!template.metaTemplateId) {
        return reply.status(400).send({ error: { code: "TEMPLATE_NOT_SUBMITTED", message: "Template has not been submitted to or approved by Meta" } });
      }

      const org = await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { phoneNumberId: true, wabaAccessToken: true },
      });
      if (!org?.phoneNumberId) {
        return reply.status(400).send({ error: { code: "WA_NOT_CONNECTED", message: "WhatsApp account not connected" } });
      }

      const recipientPhone = contact.phoneNumber;
      const accessToken = org.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";

      type StoredComp = { type?: string; format?: string; text?: string; example?: { header_url?: string[]; header_text?: string[]; body_text?: string[][] } };
      let storedComponents = (template.components ?? []) as StoredComp[];

      // If the template has an IMAGE/VIDEO/DOCUMENT header with no stored example URL,
      // fetch the full template from Meta to get header_url. Meta requires the image
      // parameter on every send — it does not fall back to its own stored sample.
      const storedHeader = storedComponents.find((c) => c.type?.toUpperCase() === "HEADER");
      const headerNeedsMedia = storedHeader &&
        ["IMAGE", "VIDEO", "DOCUMENT"].includes((storedHeader.format ?? "").toUpperCase()) &&
        !storedHeader.example?.header_url?.[0];

      if (headerNeedsMedia && template.metaTemplateId) {
        // Try to fetch the example header_url from Meta — it's present for
        // user-created templates but absent for Meta's own test templates.
        const metaRes = await fetch(
          `https://graph.facebook.com/v25.0/${template.metaTemplateId}?fields=components`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (metaRes.ok) {
          const metaData = await metaRes.json() as { components?: StoredComp[] };
          const metaHeader = (metaData.components ?? []).find((c) => c.type?.toUpperCase() === "HEADER");
          if (metaHeader?.example?.header_url?.[0]) {
            storedComponents = storedComponents.map((c) =>
              c.type?.toUpperCase() === "HEADER" ? { ...c, example: metaHeader.example } : c
            );
            await fastify.prisma.template.update({
              where: { id: template.id },
              data: { components: storedComponents as object[] },
            });
          }
        }
      }

      // After best-effort fetch, if we still have no media source, reject early.
      // Meta always requires a media parameter for IMAGE/VIDEO/DOCUMENT headers —
      // it never falls back to the template's stored sample image automatically.
      const resolvedHeader = storedComponents.find((c) => c.type?.toUpperCase() === "HEADER");
      if (
        resolvedHeader &&
        ["IMAGE", "VIDEO", "DOCUMENT"].includes((resolvedHeader.format ?? "").toUpperCase()) &&
        !resolvedHeader.example?.header_url?.[0]
      ) {
        return reply.status(400).send({
          error: {
            code: "MEDIA_REQUIRED",
            message: `This template has an ${resolvedHeader.format} header that requires a media URL. Re-sync your templates or provide a mediaUrl when sending.`,
          },
        });
      }

      const bodyComp = storedComponents.find((c) => c.type?.toUpperCase() === "BODY");
      const varCount = bodyComp?.text ? (bodyComp.text.match(/\{\{\d+\}\}/g) ?? []).length : 0;
      const callerVars = request.body.variables ?? [];
      const bodyVars = callerVars.length > 0
        ? callerVars
        : contactBodyVars({ firstName: contact.firstName, lastName: contact.lastName, phoneNumber: contact.phoneNumber, email: contact.email }, varCount);
      const components = buildTemplateComponents(storedComponents as unknown[], { body: bodyVars });

      const { messageId } = await sendTemplateMessage(
        org.phoneNumberId, recipientPhone, template.name, template.language, components, accessToken
      );

      // Build a renderable JSON body from the template components + variables
      type WaComp = { type?: string; format?: string; text?: string; buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }> };
      const comps = (template.components ?? []) as WaComp[];
      const headerComp = comps.find((c) => c.type?.toUpperCase() === "HEADER");
      const renderedBodyComp = comps.find((c) => c.type?.toUpperCase() === "BODY");
      const footerComp = comps.find((c) => c.type?.toUpperCase() === "FOOTER");
      const buttonsComp = comps.find((c) => c.type?.toUpperCase() === "BUTTONS");
      let bodyText = renderedBodyComp?.text ?? "";
      bodyVars.forEach((v, i) => {
        bodyText = bodyText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), v);
      });
      const renderedBody = JSON.stringify({
        templateName: template.name,
        header: headerComp ? { format: headerComp.format ?? "TEXT", text: headerComp.text ?? null } : null,
        body: bodyText || template.name,
        footer: footerComp?.text ?? null,
        buttons: buttonsComp?.buttons ?? [],
      });

      let conversation = await fastify.prisma.conversation.findFirst({
        where: { organizationId, contactId: contact.id },
        orderBy: { createdAt: "desc" },
      });

      if (!conversation) {
        conversation = await fastify.prisma.conversation.create({
          data: { organizationId, contactId: contact.id, whatsappContactId: recipientPhone },
        });
      }

      const message = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType: "template",
          body: renderedBody,
          whatsappMessageId: messageId,
          status: "sent",
        },
      });

      return reply.send({ data: { message } });
    }
  );
};
