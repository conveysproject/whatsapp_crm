import type { FastifyPluginAsync } from "fastify";

interface LabelBody {
  title: string;
  textColor?: string;
  bgColor?: string;
}

export const labelsRouter: FastifyPluginAsync = async (fastify) => {
  // ── Label CRUD ─────────────────────────────────────────────────────────────

  fastify.get("/labels", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.label.findMany({
      where: { organizationId, isActive: true },
      orderBy: { title: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: LabelBody }>("/labels", async (request, reply) => {
    const { organizationId } = request.auth;
    const { title, textColor, bgColor } = request.body;
    const data = await fastify.prisma.label.create({
      data: {
        organizationId,
        title,
        textColor: textColor ?? "#ffffff",
        bgColor: bgColor ?? "#6366f1",
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<LabelBody> }>(
    "/labels/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.label.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Label not found" } });
      const { title, textColor, bgColor } = request.body;
      const data = await fastify.prisma.label.update({
        where: { id: request.params.id },
        data: {
          ...(title !== undefined && { title }),
          ...(textColor !== undefined && { textColor }),
          ...(bgColor !== undefined && { bgColor }),
        },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/labels/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.label.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Label not found" } });
    await fastify.prisma.label.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  // ── Contact label assignment ───────────────────────────────────────────────

  fastify.post<{ Params: { id: string }; Body: { labelIds: string[] } }>(
    "/contacts/:id/labels",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!contact) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });

      const validLabels = await fastify.prisma.label.findMany({
        where: { id: { in: request.body.labelIds }, organizationId },
        select: { id: true },
      });
      await fastify.prisma.contactLabel.createMany({
        data: validLabels.map((l) => ({ contactId: request.params.id, labelId: l.id })),
        skipDuplicates: true,
      });
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Params: { id: string; labelId: string } }>(
    "/contacts/:id/labels/:labelId",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!contact) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      await fastify.prisma.contactLabel.deleteMany({
        where: { contactId: request.params.id, labelId: request.params.labelId },
      });
      return reply.status(204).send();
    }
  );

  fastify.get<{ Params: { id: string } }>("/contacts/:id/labels", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!contact) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    const rows = await fastify.prisma.contactLabel.findMany({
      where: { contactId: request.params.id },
      include: { label: true },
    });
    return reply.send({ data: rows.map((r) => r.label) });
  });

  // ── Message label assignment ───────────────────────────────────────────────

  fastify.post<{ Params: { id: string }; Body: { labelIds: string[] } }>(
    "/messages/:id/labels",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!message) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });

      const validLabels = await fastify.prisma.label.findMany({
        where: { id: { in: request.body.labelIds }, organizationId },
        select: { id: true },
      });
      await fastify.prisma.messageLabel.createMany({
        data: validLabels.map((l) => ({ messageId: request.params.id, labelId: l.id })),
        skipDuplicates: true,
      });
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Params: { id: string; labelId: string } }>(
    "/messages/:id/labels/:labelId",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!message) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
      await fastify.prisma.messageLabel.deleteMany({
        where: { messageId: request.params.id, labelId: request.params.labelId },
      });
      return reply.status(204).send();
    }
  );
};
