import type { FastifyPluginAsync } from "fastify";

interface CustomFieldBody {
  inputName: string;
  inputType?: string;
  options?: string[];
}

export const customFieldsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/contacts/custom-fields", async (request, reply) => {
    const { organizationId } = request.auth;
    const fields = await fastify.prisma.contactCustomField.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    return reply.send({ data: fields });
  });

  fastify.post<{ Body: CustomFieldBody }>("/contacts/custom-fields", async (request, reply) => {
    const { organizationId } = request.auth;
    const { inputName, inputType = "text" } = request.body;
    if (!inputName) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "inputName is required" } });
    }
    const field = await fastify.prisma.contactCustomField.create({
      data: { organizationId, inputName, inputType },
    });
    return reply.status(201).send({ data: field });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<CustomFieldBody> }>(
    "/contacts/custom-fields/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const field = await fastify.prisma.contactCustomField.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!field) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Custom field not found" } });
      }
      const { inputName, inputType } = request.body;
      const updated = await fastify.prisma.contactCustomField.update({
        where: { id: field.id },
        data: {
          ...(inputName ? { inputName } : {}),
          ...(inputType ? { inputType } : {}),
        },
      });
      return reply.send({ data: updated });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/contacts/custom-fields/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const field = await fastify.prisma.contactCustomField.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!field) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Custom field not found" } });
      }
      await fastify.prisma.contactCustomField.update({
        where: { id: field.id },
        data: { isActive: false },
      });
      return reply.status(204).send();
    }
  );
};
