import type { FastifyPluginAsync } from "fastify";
import type { TemplateCategory, TemplateStatus } from "@prisma/client";
import { submitTemplateToMeta } from "../lib/meta-templates.js";
import type { TemplateId } from "@trustcrm/shared";

interface TemplateBody {
  name: string;
  category: TemplateCategory;
  language: string;
  components: object[];
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
    const { organizationId } = request.auth;
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
      components: template.components as object[],
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
};
