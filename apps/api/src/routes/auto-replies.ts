import type { FastifyPluginAsync } from "fastify";
import type { Prisma, AutoReplyTriggerType } from "@prisma/client";

interface AutoReply {
  id: string;
  organizationId: string;
  name: string;
  triggerType: AutoReplyTriggerType;
  triggerKeyword: string;
  replyText: string;
  replyData: Prisma.InputJsonValue | null;
  flowId: string | null;
  parentId: string | null;
  priorityIndex: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Contact {
  id: string;
  organizationId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

function interpolate(template: string, contact: Contact): string {
  return template
    .replace(/\{\{first_name\}\}/g, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/g, contact.lastName ?? "")
    .replace(/\{\{phone\}\}/g, contact.phone ?? "");
}

interface AutoReplyBody {
  name: string;
  triggerType: AutoReplyTriggerType;
  triggerKeyword: string;
  replyText: string;
  replyData?: Prisma.InputJsonValue;
  flowId?: string | null;
  parentId?: string | null;
  priorityIndex?: number;
  isActive?: boolean;
}

export const autoRepliesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/auto-replies", async (request, reply) => {
    const { organizationId } = request.auth;
    const autoReplies = await fastify.prisma.autoReply.findMany({
      where: { organizationId },
      orderBy: { priorityIndex: "asc" },
    });
    return reply.send({ data: autoReplies });
  });

  fastify.post<{ Body: AutoReplyBody }>("/auto-replies", async (request, reply) => {
    const { organizationId } = request.auth;
    const { name, triggerType, triggerKeyword, replyText, replyData, flowId, parentId, priorityIndex, isActive } = request.body;
    const data = await fastify.prisma.autoReply.create({
      data: {
        organizationId,
        name,
        triggerType,
        triggerKeyword,
        replyText,
        replyData: (replyData ?? null) as Prisma.InputJsonValue,
        flowId: flowId ?? null,
        parentId: parentId ?? null,
        priorityIndex: priorityIndex ?? 0,
        isActive: isActive ?? true,
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<AutoReplyBody> }>("/auto-replies/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.autoReply.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Auto-reply not found" } });
    const { name, triggerType, triggerKeyword, replyText, replyData, flowId, parentId, priorityIndex, isActive } = request.body;
    const data = await fastify.prisma.autoReply.update({
      where: { id: request.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(triggerType !== undefined && { triggerType }),
        ...(triggerKeyword !== undefined && { triggerKeyword }),
        ...(replyText !== undefined && { replyText }),
        ...(replyData !== undefined && { replyData: replyData as Prisma.InputJsonValue }),
        ...(flowId !== undefined && { flowId }),
        ...(parentId !== undefined && { parentId }),
        ...(priorityIndex !== undefined && { priorityIndex }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return reply.send({ data });
  });

  fastify.delete<{ Params: { id: string } }>("/auto-replies/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.autoReply.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Auto-reply not found" } });
    await fastify.prisma.autoReply.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/auto-replies/:id/duplicate", async (request, reply) => {
    const { organizationId } = request.auth;
    const original = await fastify.prisma.autoReply.findFirst({
      where: { id: request.params.id, organizationId },
    }) as AutoReply | null;
    if (!original) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Auto-reply not found" } });
    }
    const copy = await fastify.prisma.autoReply.create({
      data: {
        organizationId: original.organizationId,
        name: `Copy of ${original.name}`,
        triggerType: original.triggerType,
        triggerKeyword: original.triggerKeyword,
        replyText: original.replyText,
        replyData: original.replyData as Prisma.InputJsonValue,
        flowId: original.flowId,
        priorityIndex: original.priorityIndex,
        isActive: false,
      },
    });
    return reply.status(201).send({ data: copy });
  });

  fastify.get<{ Params: { id: string; contactId: string } }>("/auto-replies/:id/preview/:contactId", async (request, reply) => {
    const { organizationId } = request.auth;
    const autoReply = await fastify.prisma.autoReply.findFirst({
      where: { id: request.params.id, organizationId },
    }) as AutoReply | null;
    if (!autoReply) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Auto-reply not found" } });
    }
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.contactId, organizationId },
    }) as Contact | null;
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    const preview = interpolate(autoReply.replyText, contact);
    return reply.send({ data: { preview, autoReply } });
  });
};
