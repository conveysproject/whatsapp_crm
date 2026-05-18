import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import type { LifecycleStage } from "@prisma/client";
import { paginate, parsePaginationParams } from "../lib/pagination.js";
import { indexContact, removeContact, searchContacts } from "../lib/search.js";
import { generateContactsCsv } from "../lib/csv.js";
import type { ContactId } from "@WBMSG/shared";

function csvEscape(value: string): string {
  const str = value.replace(/"/g, '""');
  if (/[",\r\n]/.test(str) || /^[=+\-@]/.test(str)) {
    return `"${str}"`;
  }
  return str;
}

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
  fastify.get<{ Querystring: { format?: string } }>("/contacts/export", async (request, reply) => {
    const { organizationId } = request.auth;
    const format = request.query.format;

    if (format === "json") {
      const contacts = await fastify.prisma.contact.findMany({
        where: { organizationId },
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, countryCode: true, createdAt: true },
      });
      return reply.send({ data: contacts });
    }

    if (format === "csv") {
      const contacts = await fastify.prisma.contact.findMany({
        where: { organizationId },
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, countryCode: true, createdAt: true },
      });
      const header = "id,first_name,last_name,phone,email,country_code,created_at\n";
      const rows = contacts.map((c) =>
        [
          csvEscape(c.id),
          csvEscape(c.firstName ?? ""),
          csvEscape(c.lastName ?? ""),
          csvEscape(c.phoneNumber),
          csvEscape(c.email ?? ""),
          csvEscape(c.countryCode ?? ""),
          csvEscape(c.createdAt.toISOString()),
        ].join(",")
      );
      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", "attachment; filename=contacts.csv")
        .send(header + rows.join("\n"));
    }

    // Default: full export using generateContactsCsv (legacy format)
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

  // ── Bulk group assignment ────────────────────────────────────────────────
  fastify.post<{ Body: { contactIds: string[]; groupIds: string[] } }>(
    "/contacts/bulk/assign-groups",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { contactIds, groupIds } = request.body;
      const validGroups = await fastify.prisma.contactGroup.findMany({
        where: { id: { in: groupIds }, organizationId },
        select: { id: true },
      });
      const safeGroupIds = validGroups.map((g) => g.id);
      if (safeGroupIds.length === 0) return reply.send({ success: true });
      const pairs: { contactGroupId: string; contactId: string }[] = [];
      for (const groupId of safeGroupIds) {
        for (const contactId of contactIds) {
          pairs.push({ contactGroupId: groupId, contactId });
        }
      }
      await fastify.prisma.groupContact.createMany({ data: pairs, skipDuplicates: true });
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Body: { contactIds: string[]; groupIds: string[] } }>(
    "/contacts/bulk/unassign-groups",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { contactIds, groupIds } = request.body;
      const validGroups = await fastify.prisma.contactGroup.findMany({
        where: { id: { in: groupIds }, organizationId },
        select: { id: true },
      });
      const safeGroupIds = validGroups.map((g) => g.id);
      if (safeGroupIds.length > 0) {
        await fastify.prisma.groupContact.deleteMany({
          where: { contactGroupId: { in: safeGroupIds }, contactId: { in: contactIds } },
        });
      }
      return reply.send({ success: true });
    }
  );

  fastify.get<{ Querystring: { q?: string } }>("/contacts/search", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = (request.query as Record<string, string>)["q"] ?? "";
    const results = await searchContacts(organizationId, query);
    return reply.send({ data: results });
  });

  fastify.get("/contacts", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const { cursor, limit } = parsePaginationParams(query);
    const labelId = query["labelId"];

    const contacts = await fastify.prisma.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(labelId ? { labels: { some: { labelId } } } : {}),
      },
      include: { labels: { include: { label: true } } },
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    return reply.send(paginate(contacts, limit));
  });

  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId, deletedAt: null },
      include: { labels: { include: { label: true } } },
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
        where: { id: request.params.id, organizationId, deletedAt: null },
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
      where: { id: request.params.id, organizationId, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    // GDPR soft delete — preserves audit trail; removes from search index immediately
    await fastify.prisma.contact.update({
      where: { id: request.params.id },
      data: { deletedAt: new Date() },
    });
    await removeContact(request.params.id);
    return reply.status(204).send();
  });

  // ── Contact block / unblock ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/contacts/:id/block", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({ where: { id: request.params.id, organizationId } });
    if (!contact) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contact.update({ where: { id: request.params.id }, data: { waBlockedAt: new Date() } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/contacts/:id/unblock", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({ where: { id: request.params.id, organizationId } });
    if (!contact) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contact.update({ where: { id: request.params.id }, data: { waBlockedAt: null } });
    return reply.send({ data });
  });

  // ── AI bot toggle ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { disabled: boolean } }>(
    "/contacts/:id/toggle-bot",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const contact = await fastify.prisma.contact.findFirst({ where: { id: request.params.id, organizationId } });
      if (!contact) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.contact.update({ where: { id: request.params.id }, data: { disableBot: request.body.disabled } });
      return reply.send({ data });
    }
  );

  // ── Notes ────────────────────────────────────────────────────────────────
  fastify.put<{ Params: { id: string }; Body: { notes: string } }>(
    "/contacts/:id/notes",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const contact = await fastify.prisma.contact.findFirst({ where: { id: request.params.id, organizationId } });
      if (!contact) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.contact.update({ where: { id: request.params.id }, data: { notes: request.body.notes } });
      return reply.send({ data });
    }
  );

  // ── Assign user ──────────────────────────────────────────────────────────
  fastify.put<{ Params: { id: string }; Body: { userId: string | null } }>(
    "/contacts/:id/assign",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const contact = await fastify.prisma.contact.findFirst({ where: { id: request.params.id, organizationId } });
      if (!contact) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.contact.update({ where: { id: request.params.id }, data: { assignedUserId: request.body.userId } });
      return reply.send({ data });
    }
  );
};
