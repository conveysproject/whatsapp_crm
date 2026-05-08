import type { FastifyPluginAsync } from "fastify";

interface GroupBody {
  title: string;
  description?: string;
}

export const contactGroupsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { archived?: string } }>("/contact-groups", async (request, reply) => {
    const { organizationId } = request.auth;
    const isArchived = request.query.archived === "true";
    const data = await fastify.prisma.contactGroup.findMany({
      where: { organizationId, isArchived },
      include: { _count: { select: { contacts: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: GroupBody }>("/contact-groups", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.contactGroup.create({
      data: { organizationId, title: request.body.title, description: request.body.description ?? null },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<GroupBody> }>(
    "/contact-groups/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.contactGroup.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.title !== undefined && { title: request.body.title }),
          ...(request.body.description !== undefined && { description: request.body.description }),
        },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/contact-groups/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.contactGroup.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/contact-groups/:id/archive", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contactGroup.update({ where: { id: request.params.id }, data: { isArchived: true } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/contact-groups/:id/unarchive", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contactGroup.update({ where: { id: request.params.id }, data: { isArchived: false } });
    return reply.send({ data });
  });

  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/contact-groups/:id/contacts",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.groupContact.findMany({
        where: { contactGroupId: request.params.id },
        include: { contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true } } },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );

  fastify.post<{ Params: { id: string }; Body: { contactIds: string[] } }>(
    "/contact-groups/:id/contacts",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await fastify.prisma.groupContact.createMany({
        data: request.body.contactIds.map((contactId) => ({ contactGroupId: request.params.id, contactId })),
        skipDuplicates: true,
      });
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Params: { id: string }; Body: { contactIds: string[] } }>(
    "/contact-groups/:id/contacts",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await fastify.prisma.groupContact.deleteMany({
        where: { contactGroupId: request.params.id, contactId: { in: request.body.contactIds } },
      });
      return reply.send({ success: true });
    }
  );
};
