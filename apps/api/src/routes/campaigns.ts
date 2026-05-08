import type { FastifyPluginAsync } from "fastify";
import type { CampaignStatus, CampaignRecipientStatus } from "@prisma/client";
import { campaignQueue } from "../lib/queue.js";
import type { CampaignId, SegmentId, TemplateId } from "@WBMSG/shared";

interface CampaignBody {
  name: string;
  templateId: TemplateId;
  segmentId?: SegmentId;
  scheduledAt?: string;
}

export const campaignsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaigns = await fastify.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: campaigns });
  });

  fastify.get<{ Params: { id: CampaignId } }>("/campaigns/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!campaign) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    }
    return reply.send({ data: campaign });
  });

  fastify.post<{ Body: CampaignBody }>("/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.create({
      data: {
        organizationId,
        name: request.body.name,
        templateId: request.body.templateId,
        status: "draft" as CampaignStatus,
        scheduledAt: request.body.scheduledAt ? new Date(request.body.scheduledAt) : null,
      },
    });
    return reply.status(201).send({ data: campaign });
  });

  fastify.post<{ Params: { id: CampaignId }; Body: { scheduledAt?: string; segmentId: SegmentId } }>(
    "/campaigns/:id/schedule",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!campaign) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      }

      const scheduledAt = request.body.scheduledAt ? new Date(request.body.scheduledAt) : new Date();
      const delay = Math.max(0, scheduledAt.getTime() - Date.now());

      await campaignQueue.add(
        "send-campaign",
        { campaignId: campaign.id, organizationId, segmentId: request.body.segmentId },
        { delay }
      );

      const updated = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "scheduled" as CampaignStatus, scheduledAt },
      });

      return reply.send({ data: updated });
    }
  );

  // ── Targeted contact count preview ───────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { groupIds?: string } }>(
    "/campaigns/:id/targeted-count",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });

      const groupIds = request.query.groupIds?.split(",").filter(Boolean) ?? [];
      let count: number;

      if (groupIds.length > 0) {
        const groupContacts = await fastify.prisma.groupContact.findMany({
          where: { contactGroupId: { in: groupIds } },
          select: { contactId: true },
        });
        const contactIds = [...new Set(groupContacts.map((gc) => gc.contactId))];
        count = await fastify.prisma.contact.count({ where: { id: { in: contactIds }, organizationId } });
      } else {
        count = await fastify.prisma.contact.count({ where: { organizationId } });
      }

      return reply.send({ data: { count } });
    }
  );

  // ── Abort ─────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/abort", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { status: "aborted" as unknown as CampaignStatus } });
    return reply.send({ data });
  });

  // ── Archive / unarchive ──────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/archive", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { isArchived: true } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/campaigns/:id/unarchive", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { isArchived: false } });
    return reply.send({ data });
  });

  // ── Requeue failed ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/requeue-failed", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const result = await fastify.prisma.campaignRecipient.updateMany({
      where: { campaignId: request.params.id, status: "failed" },
      data: { status: "pending" },
    });
    return reply.send({ data: { requeued: result.count } });
  });

  // ── Queue log (pending) ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/queue-log",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "pending" },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );

  // ── Expired log ──────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/expired-log",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "expired" as unknown as CampaignRecipientStatus },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );

  // ── Report ───────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/campaigns/:id/report", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const [sent, delivered, read, failed, pending] = await Promise.all([
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "sent" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "delivered" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "read" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "failed" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "pending" } }),
    ]);
    return reply.send({ data: { campaign, stats: { sent, delivered, read, failed, pending } } });
  });
};
