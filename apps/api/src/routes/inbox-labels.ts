import type { FastifyPluginAsync } from "fastify";

const LABEL_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6",
  "#8B5CF6", "#EC4899", "#F43F5E", "#6B7280",
];

function randomColor(): string {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)]!;
}

const NAME_RE = /^[a-zA-Z0-9 -]{1,22}$/;

export const inboxLabelsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/inbox-labels", async (request, reply) => {
    const { organizationId } = request.auth;
    const labels = await fastify.prisma.inboxLabel.findMany({
      where: { organizationId },
      include: { _count: { select: { conversationLabels: true } } },
      orderBy: { name: "asc" },
    });
    return reply.send({
      data: labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        count: l._count.conversationLabels,
      })),
    });
  });

  fastify.put<{ Params: { id: string }; Body: { name?: string } }>(
    "/conversations/:id/label",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const trimmedName = request.body?.name?.trim() ?? "";
      if (!NAME_RE.test(trimmedName)) {
        return reply.status(400).send({
          error: {
            code: "INVALID_NAME",
            message: "Label name must be 1–22 alphanumeric characters, spaces, or hyphens",
          },
        });
      }
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const inboxLabel = await fastify.prisma.inboxLabel.upsert({
        where: { organizationId_name: { organizationId, name: trimmedName } },
        create: { organizationId, name: trimmedName, color: randomColor() },
        update: {},
      });
      await fastify.prisma.conversationLabel.upsert({
        where: { conversationId: conversation.id },
        create: { conversationId: conversation.id, inboxLabelId: inboxLabel.id },
        update: { inboxLabelId: inboxLabel.id },
      });
      return reply.send({ label: { id: inboxLabel.id, name: inboxLabel.name, color: inboxLabel.color } });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/conversations/:id/label",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      await fastify.prisma.conversationLabel.deleteMany({
        where: { conversationId: conversation.id },
      });
      return reply.status(204).send();
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/inbox-labels/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const label = await fastify.prisma.inboxLabel.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!label) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Label not found" } });
      }
      await fastify.prisma.inboxLabel.delete({ where: { id: label.id } });
      return reply.status(204).send();
    }
  );
};
