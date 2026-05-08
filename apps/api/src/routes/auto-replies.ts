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

export const autoRepliesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/auto-replies", async (request, reply) => {
    const { organizationId } = request.auth;
    const autoReplies = await fastify.prisma.autoReply.findMany({ where: { organizationId } });
    return reply.send({ data: autoReplies });
  });

  fastify.post<{ Params: { id: string } }>("/auto-replies/:id/duplicate", async (request, reply) => {
    const { organizationId } = request.auth;
    const original = await fastify.prisma.autoReply.findFirst({
      where: { id: request.params.id, organizationId },
    }) as AutoReply | null;
    if (!original) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Auto-reply not found" } });
    }
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, parentId: _parentId, ...rest } = original;
    const copy = await fastify.prisma.autoReply.create({
      data: { ...rest, name: `Copy of ${original.name}`, isActive: false },
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
