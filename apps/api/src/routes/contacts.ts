import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import type { LifecycleStage } from "@prisma/client";
import { paginate, parsePaginationParams } from "../lib/pagination.js";
import { indexContact, removeContact, searchContacts } from "../lib/search.js";
import { generateContactsCsv, parseContactsCsv } from "../lib/csv.js";
import type { ContactId } from "@trustcrm/shared";

interface ContactBody {
  phoneNumber: string;
  name?: string;
  email?: string;
  companyId?: string;
}

interface ContactPatchBody {
  name?: string;
  email?: string;
  lifecycleStage?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export const contactsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/contacts/export", async (request, reply) => {
    const { organizationId } = request.auth;
    const contacts = await fastify.prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    const csv = generateContactsCsv(contacts);
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", "attachment; filename=contacts.csv")
      .send(csv);
  });

  fastify.post("/contacts/import", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await (request as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> }> }).file();
    const buffer = await data.toBuffer();
    const rows = parseContactsCsv(buffer.toString("utf-8"));

    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.phoneNumber) { skipped++; continue; }
      try {
        await fastify.prisma.contact.create({
          data: {
            organizationId,
            phoneNumber: row.phoneNumber.trim(),
            name: row.name || null,
            email: row.email || null,
            lifecycleStage: (row.lifecycleStage as LifecycleStage) || "lead",
            tags: row.tags ? row.tags.split(";").map((t) => t.trim()).filter(Boolean) : [],
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }
    return reply.send({ data: { created, skipped, total: rows.length } });
  });

  fastify.get<{ Querystring: { q?: string } }>("/contacts/search", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = (request.query as Record<string, string>)["q"] ?? "";
    const results = await searchContacts(organizationId, query);
    return reply.send({ data: results });
  });

  fastify.get("/contacts", async (request, reply) => {
    const { organizationId } = request.auth;
    const { cursor, limit } = parsePaginationParams(request.query as Record<string, string>);

    const contacts = await fastify.prisma.contact.findMany({
      where: {
        organizationId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    return reply.send(paginate(contacts, limit));
  });

  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    return reply.send({ data: contact });
  });

  fastify.post<{ Body: ContactBody }>("/contacts", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.create({
      data: {
        organizationId,
        phoneNumber: request.body.phoneNumber,
        name: request.body.name ?? null,
        email: request.body.email ?? null,
        companyId: request.body.companyId ?? null,
      },
    });
    await indexContact({
      id: contact.id,
      organizationId: contact.organizationId,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      lifecycleStage: contact.lifecycleStage,
    });
    return reply.status(201).send({ data: contact });
  });

  fastify.patch<{ Params: { id: ContactId }; Body: ContactPatchBody }>(
    "/contacts/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }
      const contact = await fastify.prisma.contact.update({
        where: { id: request.params.id },
        data: {
          name: request.body.name,
          email: request.body.email,
          lifecycleStage: request.body.lifecycleStage as LifecycleStage | undefined,
          tags: request.body.tags,
          customFields: request.body.customFields as Prisma.InputJsonValue | undefined,
        },
      });
      await indexContact({
        id: contact.id,
        organizationId: contact.organizationId,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        email: contact.email,
        lifecycleStage: contact.lifecycleStage,
      });
      return reply.send({ data: contact });
    }
  );

  fastify.delete<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    await fastify.prisma.contact.delete({ where: { id: request.params.id } });
    await removeContact(request.params.id);
    return reply.status(204).send();
  });
};
