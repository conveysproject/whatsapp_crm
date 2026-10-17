import type { FastifyPluginAsync } from "fastify";
import { canAccess, maskEmail, maskPhone, shouldHideContactFields, shouldHidePhone } from "../lib/permissions.js";
import { contactVisibilityWhere } from "../lib/contact-access.js";
import { conversationListWhere } from "../lib/conversation-access.js";

export const searchRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { q: string; types?: string } }>(
    "/search",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string", minLength: 1 },
            types: { type: "string" },
          },
          required: ["q"],
        },
      },
    },
    async (request) => {
      const { q, types } = request.query;
      const { organizationId, role, permissions } = request.auth;
      const enabled = new Set((types ?? "contacts,conversations,messages").split(","));
      // Each section follows the same permission + visibility rules as its own list API.
      const canContacts = enabled.has("contacts") && canAccess(role, permissions, "contacts_access");
      const canInbox = canAccess(role, permissions, "inbox_access");
      const [contactVis, convVis] = await Promise.all([
        canContacts ? contactVisibilityWhere(fastify.prisma, request.auth) : undefined,
        canInbox ? conversationListWhere(fastify.prisma, request.auth) : undefined,
      ]);
      const hidePhone = shouldHidePhone(permissions);
      const hideFields = shouldHideContactFields(permissions);

      const [contacts, conversations, messages] = await Promise.all([
        canContacts
          ? fastify.prisma.contact.findMany({
              where: {
                organizationId,
                ...(contactVis ?? {}),
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { phoneNumber: { contains: q } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
              select: { id: true, name: true, phoneNumber: true, email: true },
              take: 10,
            })
          : [],
        canInbox && enabled.has("conversations")
          ? fastify.prisma.conversation.findMany({
              where: {
                organizationId,
                ...(convVis ?? {}),
                whatsappContactId: { contains: q },
              },
              select: { id: true, whatsappContactId: true, status: true, lastMessageAt: true },
              take: 10,
            })
          : [],
        canInbox && enabled.has("messages")
          ? fastify.prisma.message.findMany({
              where: {
                organizationId,
                ...(convVis ? { conversation: convVis } : {}),
                body: { contains: q, mode: "insensitive" },
              },
              select: { id: true, conversationId: true, body: true, sentAt: true },
              take: 10,
            })
          : [],
      ]);

      return {
        data: {
          contacts: contacts.map((c) => ({
            ...c,
            phoneNumber: hidePhone ? maskPhone(c.phoneNumber) : c.phoneNumber,
            email: hideFields && c.email ? maskEmail(c.email) : c.email,
            type: "contact" as const,
          })),
          conversations: conversations.map((c) => ({
            ...c,
            whatsappContactId: hidePhone && c.whatsappContactId ? maskPhone(c.whatsappContactId) : c.whatsappContactId,
            type: "conversation" as const,
          })),
          messages: messages.map((m) => ({ ...m, type: "message" as const })),
        },
        meta: { query: q, total: contacts.length + conversations.length + messages.length },
      };
    }
  );
};
