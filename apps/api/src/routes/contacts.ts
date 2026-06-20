import type { FastifyPluginAsync } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { evaluateSegment, type FilterRule, type MatchMode } from "../lib/segment-evaluator.js";
import { paginate, parsePaginationParams } from "../lib/pagination.js";

import type { ContactId } from "@WBMSG/shared";
import { maskPhone, maskEmail, canAccess, hasSubPermission } from "../lib/permissions.js";
import { checkPlanLimit } from "../lib/plan-limits.js";
import { normalizeFullPhone } from "../lib/phone-normalize.js";
import { dispatchFlowTrigger } from "../lib/trigger-dispatcher.js";

function csvEscape(value: string): string {
  const str = value.replace(/"/g, '""');
  if (/[",\r\n]/.test(str) || /^[=+\-@]/.test(str)) {
    return `"${str}"`;
  }
  return str;
}

async function buildExportWhere(
  prisma: PrismaClient,
  organizationId: string,
  rawUrl: string,
): Promise<Prisma.ContactWhereInput> {
  const rawSearch = rawUrl.split("?")[1] ?? "";
  const usp = new URLSearchParams(rawSearch);

  const leadStatusIds = usp.getAll("leadStatusId");
  const tags = usp.getAll("tags");
  const segmentId = usp.get("segmentId") ?? undefined;
  const groupIds = usp.getAll("groupIds");

  const cfFilters: Record<string, string> = {};
  for (const [key, value] of usp) {
    const m = key.match(/^cf\[(.+)\]$/);
    if (m?.[1]) cfFilters[m[1]] = value;
  }

  let segmentContactIds: string[] | undefined;
  if (segmentId) {
    const segment = await prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
    if (segment) {
      const result = await evaluateSegment(
        prisma,
        organizationId,
        segment.filters as unknown as FilterRule[],
        (segment.match ?? "all") as MatchMode,
      );
      segmentContactIds = result.contacts.map((c) => c.id);
    }
  }

  let cfClauses: Prisma.ContactWhereInput[] = [];
  if (Object.keys(cfFilters).length > 0) {
    const cfMeta = await prisma.contactCustomField.findMany({
      where: { id: { in: Object.keys(cfFilters) }, organizationId },
      select: { id: true, inputName: true },
    });
    const cfMetaMap = new Map(cfMeta.map((cf) => [cf.id, cf.inputName]));
    cfClauses = Object.entries(cfFilters).map(([fieldId, value]) => ({
      customFields: { path: [cfMetaMap.get(fieldId) ?? fieldId], string_contains: value },
    }));
  }

  return {
    organizationId,
    deletedAt: null,
    ...(leadStatusIds.length > 0 && { leadStatusId: { in: leadStatusIds } }),
    ...(tags.length > 0 && { tags: { hasEvery: tags } }),
    ...(segmentContactIds !== undefined && { id: { in: segmentContactIds } }),
    ...(groupIds.length > 0 && { groupContacts: { some: { contactGroupId: { in: groupIds } } } }),
    ...(cfClauses.length > 0 && { AND: cfClauses }),
  };
}

interface ContactBody {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  countryId?: number;
  languageCode?: string;
  whatsappOptOut?: boolean;
  disableBot?: boolean;
  groupIds?: string[];
  customFields?: Record<string, unknown>;
  leadStatusId?: string;
}

interface ContactPatchBody {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  leadStatusId?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  countryId?: number | null;
  languageCode?: string | null;
  whatsappOptOut?: boolean;
  disableBot?: boolean;
  groupIds?: string[];
  notes?: string;
}

export const contactsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/contacts/export/count", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_contacts permission required" } });
    }
    if (!hasSubPermission(permissions, "manage_contacts", "export_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "export_contacts permission required" } });
    }
    const where = await buildExportWhere(fastify.prisma, organizationId, request.raw.url ?? "");
    const count = await fastify.prisma.contact.count({ where });
    return reply.send({ data: { count } });
  });

  fastify.get<{ Querystring: { format?: string } }>("/contacts/export", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    // GAP-S04: manage_contacts + export_contacts sub-permission required
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_contacts permission required" } });
    }
    if (!hasSubPermission(permissions, "manage_contacts", "export_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "export_contacts permission required" } });
    }
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
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, countryCode: true, country: { select: { name: true } }, createdAt: true },
      });
      const header = "id,first_name,last_name,phone,email,country,created_at\n";
      const rows = contacts.map((c) =>
        [
          csvEscape(c.id),
          csvEscape(c.firstName ?? ""),
          csvEscape(c.lastName ?? ""),
          csvEscape(`="${c.phoneNumber}"`),
          csvEscape(c.email ?? ""),
          csvEscape(c.country?.name ?? c.countryCode ?? ""),
          csvEscape(c.createdAt.toISOString()),
        ].join(",")
      );
      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", "attachment; filename=contacts.csv")
        .send(header + rows.join("\n"));
    }

    // Default: rich CSV with filters
    const where = await buildExportWhere(fastify.prisma, organizationId, request.raw.url ?? "");

    const [customFields, contacts] = await Promise.all([
      fastify.prisma.contactCustomField.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, inputName: true },
        orderBy: { inputName: "asc" },
      }),
      fastify.prisma.contact.findMany({
        where,
        include: {
          leadStatus: { select: { name: true } },
          groupContacts: { include: { contactGroup: { select: { title: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const fixedHeaders = [
      "Full Phone", "First Name", "Last Name", "Email", "Country Code",
      "Lead Status", "Tags", "Groups", "Notes", "Created At",
    ];
    const cfHeaders = customFields.map((cf) => cf.inputName);
    const header = [...fixedHeaders, ...cfHeaders].map(csvEscape).join(",");

    const rows = contacts.map((c) => {
      const cfBlob = (c.customFields ?? {}) as Record<string, unknown>;
      const cells = [
        csvEscape(`="${c.phoneNumber}"`),
        csvEscape(c.firstName ?? ""),
        csvEscape(c.lastName ?? ""),
        csvEscape(c.email ?? ""),
        csvEscape(c.countryCode ?? ""),
        csvEscape(c.leadStatus?.name ?? ""),
        csvEscape(c.tags.join("|")),
        csvEscape(c.groupContacts.map((gc) => gc.contactGroup.title).join("|")),
        csvEscape((c.notes ?? "").replace(/[\r\n]+/g, " ")),
        csvEscape(c.createdAt.toISOString()),
        ...customFields.map((cf) => csvEscape(String(cfBlob[cf.inputName] ?? cfBlob[cf.id] ?? ""))),
      ];
      return cells.join(",");
    });

    const dateStr = new Date().toISOString().split("T")[0]!;
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="contacts-${dateStr}.csv"`)
      .send(header + "\n" + rows.join("\n"));
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
    const q = ((request.query as Record<string, string>)["q"] ?? "").trim();
    const results = await fastify.prisma.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phoneNumber: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
      },
      select: { id: true, organizationId: true, name: true, phoneNumber: true, email: true, leadStatus: { select: { id: true, name: true, color: true } } },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: results });
  });

  fastify.get("/contacts", async (request, reply) => {
    const { organizationId, permissions } = request.auth;
    const query = request.query as Record<string, string>;
    const { cursor, limit } = parsePaginationParams(query);
    const q = query["q"]?.trim() ?? "";
    const tagFilter = query["tag"];

    const countryId = query["countryId"] ? parseInt(query["countryId"], 10) : undefined;

    const contacts = await fastify.prisma.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(tagFilter ? { tags: { has: tagFilter } } : {}),
        ...(countryId && !isNaN(countryId) ? { countryId } : {}),
        ...(q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phoneNumber: { contains: q } },
          ],
        } : {}),
      },
      include: { country: true, leadStatus: { select: { id: true, name: true, color: true } }, groupContacts: { include: { contactGroup: { select: { id: true, title: true } } } } },
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    const hidePhone = permissions["hide_contact_phone_numbers"] === "allow";
    const hideEmail = permissions["hide_contact_emails"] === "allow";
    const masked = (hidePhone || hideEmail)
      ? contacts.map((c) => ({
          ...c,
          phoneNumber: hidePhone ? maskPhone(c.phoneNumber) : c.phoneNumber,
          email: hideEmail && c.email ? maskEmail(c.email) : c.email,
        }))
      : contacts;

    return reply.send(paginate(masked, limit));
  });

  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId, permissions } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId, deletedAt: null },
      include: {
        country: true,
        leadStatus: { select: { id: true, name: true, color: true } },
        groupContacts: { select: { contactGroupId: true } },
      },
    });
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    const hidePhone = permissions["hide_contact_phone_numbers"] === "allow";
    const hideEmail = permissions["hide_contact_emails"] === "allow";
    const data = {
      ...contact,
      phoneNumber: hidePhone ? maskPhone(contact.phoneNumber) : contact.phoneNumber,
      email: hideEmail && contact.email ? maskEmail(contact.email) : contact.email,
      groupIds: contact.groupContacts.map((g) => g.contactGroupId),
    };
    return reply.send({ data });
  });

  fastify.post<{ Body: ContactBody }>("/contacts", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    // GAP-S04: manage_contacts permission required to create contacts
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_contacts permission required" } });
    }
    const limitCheck = await checkPlanLimit(fastify.prisma, organizationId, "contacts");
    if (!limitCheck.allowed) {
      return reply.status(402).send({ error: { code: "PLAN_LIMIT_REACHED", message: `Contact limit of ${limitCheck.limit} reached` } });
    }
    if (request.body.leadStatusId) {
      const ls = await fastify.prisma.leadStatus.findFirst({ where: { id: request.body.leadStatusId, organizationId } });
      if (!ls) return reply.status(400).send({ error: { code: "INVALID_LEAD_STATUS", message: "leadStatusId not found in organization" } });
    }
    // Apply the org's default lead status (Basic Configuration) when none is provided
    let effectiveLeadStatusId: string | null = request.body.leadStatusId ?? null;
    if (!effectiveLeadStatusId) {
      const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
      const defaultId = ((org?.settings as Record<string, unknown> | null)?.["contactConfig"] as { defaultLeadStatusId?: string | null } | undefined)?.defaultLeadStatusId;
      if (defaultId) {
        const def = await fastify.prisma.leadStatus.findFirst({ where: { id: defaultId, organizationId }, select: { id: true } });
        if (def) effectiveLeadStatusId = def.id;
      }
    }
    let contact: Awaited<ReturnType<typeof fastify.prisma.contact.create>>;
    try {
      const { firstName, lastName, name, phoneNumber: rawPhone, email, countryId, languageCode, whatsappOptOut, disableBot, groupIds, customFields } = request.body;
      const phoneNumber = normalizeFullPhone(rawPhone) ?? rawPhone;
      contact = await fastify.prisma.contact.create({
        data: {
          organizationId,
          phoneNumber,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          name: name ?? (firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : null),
          email: email ?? null,
          countryId: countryId ?? null,
          languageCode: languageCode ?? null,
          whatsappOptOut: whatsappOptOut ?? false,
          disableBot: disableBot ?? false,
          ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}),
          ...(effectiveLeadStatusId ? { leadStatusId: effectiveLeadStatusId } : {}),
        },
      });
      if (groupIds && groupIds.length > 0) {
        const validGroups = await fastify.prisma.contactGroup.findMany({
          where: { id: { in: groupIds }, organizationId },
          select: { id: true },
        });
        if (validGroups.length > 0) {
          await fastify.prisma.groupContact.createMany({
            data: validGroups.map((g) => ({ contactGroupId: g.id, contactId: contact.id })),
            skipDuplicates: true,
          });
        }
      }
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
        return reply.status(409).send({ error: { code: "DUPLICATE_PHONE", message: "A contact with this phone number already exists in your organization." } });
      }
      throw err;
    }
    void dispatchFlowTrigger(fastify.prisma, organizationId, "contact_created", {
      organizationId,
      contactPhone: contact.phoneNumber,
      contactId: contact.id,
    });
    return reply.status(201).send({ data: contact });
  });

  fastify.patch<{ Params: { id: ContactId }; Body: ContactPatchBody }>(
    "/contacts/:id",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "manage_contacts")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_contacts permission required" } });
      }
      const existing = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId, deletedAt: null },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }
      if (request.body.leadStatusId) {
        const ls = await fastify.prisma.leadStatus.findFirst({ where: { id: request.body.leadStatusId, organizationId } });
        if (!ls) return reply.status(400).send({ error: { code: "INVALID_LEAD_STATUS", message: "leadStatusId not found in organization" } });
      }

      const { firstName, lastName } = request.body;
      const derivedName =
        request.body.name ??
        (firstName !== undefined || lastName !== undefined
          ? [firstName ?? existing.firstName, lastName ?? existing.lastName].filter(Boolean).join(" ") || null
          : undefined);

      const contact = await fastify.prisma.contact.update({
        where: { id: request.params.id },
        data: {
          ...(derivedName !== undefined ? { name: derivedName } : {}),
          ...(firstName !== undefined ? { firstName } : {}),
          ...(lastName !== undefined ? { lastName } : {}),
          ...(request.body.email !== undefined ? { email: request.body.email } : {}),
          ...(request.body.leadStatusId ? { leadStatusId: request.body.leadStatusId } : {}),
          ...(request.body.tags !== undefined ? { tags: request.body.tags } : {}),
          ...(request.body.customFields !== undefined ? { customFields: request.body.customFields as Prisma.InputJsonValue } : {}),
          ...(request.body.countryId !== undefined ? { countryId: request.body.countryId } : {}),
          ...(request.body.languageCode !== undefined ? { languageCode: request.body.languageCode } : {}),
          ...(request.body.whatsappOptOut !== undefined ? { whatsappOptOut: request.body.whatsappOptOut } : {}),
          ...(request.body.disableBot !== undefined ? { disableBot: request.body.disableBot } : {}),
          ...(request.body.notes !== undefined ? { notes: request.body.notes } : {}),
        },
      });

      if (request.body.groupIds !== undefined) {
        await fastify.prisma.groupContact.deleteMany({ where: { contactId: contact.id } });
        if (request.body.groupIds.length > 0) {
          const validGroups = await fastify.prisma.contactGroup.findMany({
            where: { id: { in: request.body.groupIds }, organizationId },
            select: { id: true },
          });
          if (validGroups.length > 0) {
            await fastify.prisma.groupContact.createMany({
              data: validGroups.map((g) => ({ contactGroupId: g.id, contactId: contact.id })),
              skipDuplicates: true,
            });
          }
        }
      }

      const dispatchBase = { organizationId, contactPhone: contact.phoneNumber, contactId: contact.id };
      if (request.body.tags !== undefined) {
        const addedTags = contact.tags.filter((t) => !existing.tags.includes(t));
        if (addedTags.length > 0) {
          void dispatchFlowTrigger(fastify.prisma, organizationId, "tag_added", dispatchBase);
        }
      }
      if (request.body.leadStatusId !== undefined && request.body.leadStatusId !== existing.leadStatusId) {
        void dispatchFlowTrigger(fastify.prisma, organizationId, "lifecycle_change", dispatchBase);
      }

      return reply.send({ data: contact });
    }
  );

  // ── Find conversation by contact ────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/contacts/:id/conversation", async (request, reply) => {
    const { organizationId } = request.auth;

    // Try by contactId first (fast path)
    let conversation = await fastify.prisma.conversation.findFirst({
      where: { contactId: request.params.id, organizationId },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });

    // Fall back to phone-number match (handles recreated contacts where contactId was nulled)
    if (!conversation) {
      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId, deletedAt: null },
        select: { id: true, phoneNumber: true },
      });
      if (contact) {
        conversation = await fastify.prisma.conversation.findFirst({
          where: { organizationId, whatsappContactId: contact.phoneNumber },
          orderBy: { lastMessageAt: "desc" },
          select: { id: true },
        });
        // Re-link conversation to current contact so future lookups are fast
        if (conversation) {
          await fastify.prisma.conversation.update({
            where: { id: conversation.id },
            data: { contactId: contact.id },
          });
        }
      }
    }

    return reply.send({ data: conversation ?? null });
  });

  // ── Bulk delete ──────────────────────────────────────────────────────────
  fastify.delete<{ Body: { contactIds: string[] } }>("/contacts/bulk", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_contacts permission required" } });
    }
    const { contactIds } = request.body;
    if (!contactIds?.length) return reply.send({ deleted: 0 });
    const [result] = await fastify.prisma.$transaction([
      fastify.prisma.contact.updateMany({
        where: { id: { in: contactIds }, organizationId, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
      fastify.prisma.conversation.updateMany({
        where: { contactId: { in: contactIds } },
        data: { contactId: null },
      }),
      fastify.prisma.groupContact.deleteMany({
        where: { contactId: { in: contactIds } },
      }),
    ]);
    return reply.send({ deleted: result.count });
  });

  fastify.delete<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_contacts permission required" } });
    }
    // GAP-S04: delete_contacts sub-permission (default-allow; explicit deny blocks)
    if (!hasSubPermission(permissions, "manage_contacts", "delete_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "delete_contacts permission required" } });
    }
    const existing = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    await fastify.prisma.$transaction([
      // Soft-delete the contact
      fastify.prisma.contact.update({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      }),
      // Null out contactId on conversations so they don't dangle
      fastify.prisma.conversation.updateMany({
        where: { contactId: request.params.id },
        data: { contactId: null },
      }),
      // Remove from all groups
      fastify.prisma.groupContact.deleteMany({
        where: { contactId: request.params.id },
      }),
    ]);
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

  // ── Per-user saved contact filter (GAP-S09) ───────────────────────────────
  // Stored in VendorSetting as "saved_contact_filter_{userId}" — per-user within org
  fastify.get("/contacts/saved-filter", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const key = `saved_contact_filter_${userId}`;
    const setting = await fastify.prisma.vendorSetting.findFirst({
      where: { organizationId, key },
      select: { value: true },
    });
    const filter = setting?.value ? (JSON.parse(setting.value) as Record<string, unknown>) : null;
    return reply.send({ data: filter });
  });

  fastify.put<{ Body: Record<string, unknown> }>("/contacts/saved-filter", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const key = `saved_contact_filter_${userId}`;
    const value = JSON.stringify(request.body);
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, value, dataType: "json" },
      update: { value },
    });
    return reply.send({ success: true });
  });

  fastify.delete("/contacts/saved-filter", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const key = `saved_contact_filter_${userId}`;
    await fastify.prisma.vendorSetting.deleteMany({ where: { organizationId, key } });
    return reply.status(204).send();
  });
};
