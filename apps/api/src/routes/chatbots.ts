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
};
