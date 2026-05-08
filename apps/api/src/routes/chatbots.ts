import type { FastifyPluginAsync } from "fastify";

interface ChatbotBody {
  name: string;
  flowId: string;
}

export const chatbotsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/chatbots", async (request, reply) => {
    const { organizationId } = request.auth;
    const bots = await fastify.prisma.chatbot.findMany({ where: { organizationId } });
    return reply.send({ data: bots });
  });

  fastify.post<{ Body: ChatbotBody }>("/chatbots", async (request, reply) => {
    const { organizationId } = request.auth;
    const bot = await fastify.prisma.chatbot.create({
      data: { organizationId, name: request.body.name, flowId: request.body.flowId, isActive: false },
    });
    return reply.status(201).send({ data: bot });
  });

  fastify.post<{ Params: { id: string } }>("/chatbots/:id/activate", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.chatbot.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Chatbot not found" } });
    const bot = await fastify.prisma.chatbot.update({
      where: { id: request.params.id },
      data: { isActive: !existing.isActive },
    });
    return reply.send({ data: bot });
  });

  fastify.get<{ Params: { contactId: string } }>("/chatbots/active-for/:contactId", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.contactId, organizationId },
    });
    if (!contact) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    if (contact.disableBot) return reply.send({ data: [] });
    const chatbots = await fastify.prisma.chatbot.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, startTrigger: true },
    });
    return reply.send({ data: chatbots });
  });

  fastify.post<{ Params: { id: string; contactId: string } }>("/chatbots/:id/quick-send/:contactId", async (request, reply) => {
    const { organizationId } = request.auth;
    const chatbot = await fastify.prisma.chatbot.findFirst({ where: { id: request.params.id, organizationId } });
    if (!chatbot) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Chatbot not found" } });
    const contact = await fastify.prisma.contact.findFirst({ where: { id: request.params.contactId, organizationId } });
    if (!contact) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    const conversation = await fastify.prisma.conversation.findFirst({
      where: { contactId: contact.id, organizationId },
      orderBy: { createdAt: "desc" },
    });
    if (!conversation) return reply.status(400).send({ error: { code: "NO_CONVERSATION", message: "No conversation found for this contact" } });
    const session = await fastify.prisma.botSession.upsert({
      where: { conversationId: conversation.id },
      create: { chatbotId: chatbot.id, conversationId: conversation.id, currentNodeId: "start" },
      update: { chatbotId: chatbot.id, currentNodeId: "start", isEscalated: false },
    });
    return reply.send({ data: { session, message: "Bot session started — next inbound message will be processed by this bot" } });
  });
};
