import type { FastifyPluginAsync } from "fastify";
import type { CampaignRecipientStatus, Prisma } from "@prisma/client";
import { canAccess } from "../lib/permissions.js";

interface GroupBody {
  title: string;
  description?: string;
}

// GAP-S10: all valid campaign delivery statuses for recampaign targeting
const CAMPAIGN_RECIPIENT_STATUSES: CampaignRecipientStatus[] = ["sent", "delivered", "read", "failed", "expired", "pending", "cancelled"];

type ContactFilterFields = {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  languageCode?: string;
  lifecycleStage?: string;
  labelIds?: string[];
  groupIds?: string[];
};

// Insert contacts into group in 500-row chunks
async function bulkAddToGroup(prisma: Parameters<FastifyPluginAsync>[0]["prisma"], groupId: string, contactIds: string[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    await prisma.groupContact.createMany({
      data: contactIds.slice(i, i + CHUNK).map((contactId) => ({ contactGroupId: groupId, contactId })),
      skipDuplicates: true,
    });
  }
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
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
    }
    const data = await fastify.prisma.contactGroup.create({
      data: { organizationId, title: request.body.title, description: request.body.description ?? null },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<GroupBody> }>(
    "/contact-groups/:id",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "manage_contacts")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
      }
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
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
    }
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.contactGroup.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/contact-groups/:id/archive", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
    }
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contactGroup.update({ where: { id: request.params.id }, data: { isArchived: true } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/contact-groups/:id/unarchive", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
    }
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
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "manage_contacts")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
      }
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
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "manage_contacts")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
      }
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await fastify.prisma.groupContact.deleteMany({
        where: { contactGroupId: request.params.id, contactId: { in: request.body.contactIds } },
      });
      return reply.send({ success: true });
    }
  );

  // GAP-S10: build a group from campaign results or contact filter
  fastify.post<{
    Body: {
      title: string;
      description?: string;
      mode: "campaign_status" | "filter";
      // campaign_status mode
      campaignId?: string;
      statuses?: CampaignRecipientStatus[];
      // filter mode
      filter?: ContactFilterFields;
    };
  }>("/contact-groups/build", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
    }
    const { title, description, mode, campaignId, statuses, filter } = request.body;

    const group = await fastify.prisma.contactGroup.create({
      data: { organizationId, title, description: description ?? null },
    });

    if (mode === "campaign_status") {
      if (!campaignId) return reply.status(400).send({ error: { code: "MISSING_CAMPAIGN_ID", message: "campaignId required for campaign_status mode" } });
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      // GAP-S68: guard — cannot build group from a still-running campaign
      if (campaign.status === "running") {
        await fastify.prisma.contactGroup.delete({ where: { id: group.id } });
        return reply.status(409).send({ error: { code: "CAMPAIGN_IN_PROGRESS", message: "Campaign is still running — wait for it to complete before building a group" } });
      }
      // GAP-S68: empty statuses = "total" (all recipients, no status filter)
      const validStatuses = (statuses ?? []).filter((s) => CAMPAIGN_RECIPIENT_STATUSES.includes(s));
      const recipients = await fastify.prisma.campaignRecipient.findMany({
        where: {
          campaignId,
          organizationId,
          contactId: { not: null },
          ...(validStatuses.length > 0 ? { status: { in: validStatuses } } : {}),
        },
        select: { contactId: true },
      });
      const contactIds = [...new Set(recipients.map((r) => r.contactId!).filter(Boolean))];
      await bulkAddToGroup(fastify.prisma, group.id, contactIds);
      return reply.status(201).send({ data: { groupId: group.id, addedCount: contactIds.length } });
    }

    if (mode === "filter") {
      const where: Record<string, unknown> = { organizationId, deletedAt: null };
      if (filter?.firstName) where["firstName"] = { contains: filter.firstName, mode: "insensitive" };
      if (filter?.lastName) where["lastName"] = { contains: filter.lastName, mode: "insensitive" };
      if (filter?.phoneNumber) where["phoneNumber"] = { contains: filter.phoneNumber };
      if (filter?.email) where["email"] = { contains: filter.email, mode: "insensitive" };
      if (filter?.languageCode) where["languageCode"] = filter.languageCode;
      if (filter?.lifecycleStage) where["lifecycleStage"] = filter.lifecycleStage;
      if (filter?.labelIds?.length) {
        where["labels"] = { some: { labelId: { in: filter.labelIds } } };
      }
      if (filter?.groupIds?.length) {
        where["groups"] = { some: { contactGroupId: { in: filter.groupIds } } };
      }
      const contacts = await fastify.prisma.contact.findMany({
        where: where as Prisma.ContactWhereInput,
        select: { id: true },
      });
      const contactIds = contacts.map((c) => c.id);
      await bulkAddToGroup(fastify.prisma, group.id, contactIds);
      return reply.status(201).send({ data: { groupId: group.id, addedCount: contactIds.length } });
    }

    return reply.status(400).send({ error: { code: "INVALID_MODE", message: "mode must be campaign_status or filter" } });
  });
};
