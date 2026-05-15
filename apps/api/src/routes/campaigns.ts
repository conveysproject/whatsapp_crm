import type { FastifyPluginAsync } from "fastify";
import type { CampaignStatus } from "@prisma/client";
import { campaignQueue } from "../lib/queue.js";
import type { CampaignId, SegmentId, TemplateId } from "@WBMSG/shared";
import { evaluateSegment, type SegmentFilter } from "../lib/segment-evaluator.js";

interface CampaignBody {
  name: string;
  templateId?: TemplateId;
  textBody?: string;
  campaignType?: string;
  segmentId?: SegmentId;
  scheduledAt?: string;
  messageInterval?: number;
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
    const { name, templateId, textBody, campaignType, scheduledAt, messageInterval } = request.body;
    // For text campaigns, store the body in templateId field (worker reads it regardless of type)
    const resolvedTemplateId = campaignType === "text" || campaignType === "non_template"
      ? (textBody ?? null)
      : (templateId ?? null);
    const campaign = await fastify.prisma.campaign.create({
      data: {
        organizationId,
        name,
        templateId: resolvedTemplateId,
        campaignType: campaignType ?? "template",
        status: "draft" as CampaignStatus,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        messageInterval: messageInterval ?? null,
      },
    });
    return reply.status(201).send({ data: campaign });
  });

  fastify.patch<{ Params: { id: CampaignId }; Body: Partial<CampaignBody> }>(
    "/campaigns/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!campaign) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      }
      if (campaign.status !== "draft") {
        return reply.status(400).send({ error: { code: "NOT_DRAFT", message: "Only draft campaigns can be edited" } });
      }
      const { name, templateId, textBody, campaignType, scheduledAt, messageInterval } = request.body;
      const resolvedTemplateId = campaignType === "text" || campaignType === "non_template"
        ? (textBody ?? campaign.templateId)
        : (templateId ?? campaign.templateId);
      const updated = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          ...(name ? { name } : {}),
          ...(resolvedTemplateId !== undefined ? { templateId: resolvedTemplateId } : {}),
          ...(campaignType ? { campaignType } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
          ...(messageInterval !== undefined ? { messageInterval } : {}),
        },
      });
      return reply.send({ data: updated });
    }
  );

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
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { status: "aborted" } });
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
        where: { campaignId: request.params.id, status: "expired" },
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

  // ── Pause ────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/pause", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    if (campaign.status !== "running" && campaign.status !== "scheduled") {
      return reply.status(400).send({ error: { code: "INVALID_STATUS", message: "Campaign is not running or scheduled" } });
    }
    const data = await fastify.prisma.campaign.update({
      where: { id: request.params.id },
      data: { status: "paused" as CampaignStatus },
    });
    return reply.send({ data });
  });

  // ── Resume ───────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { segmentId?: SegmentId } }>(
    "/campaigns/:id/resume",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      if (campaign.status !== "paused") {
        return reply.status(400).send({ error: { code: "INVALID_STATUS", message: "Campaign is not paused" } });
      }

      const firstSegment = await fastify.prisma.campaignSegment.findFirst({ where: { campaignId: campaign.id } });
      const segmentId = request.body?.segmentId ?? firstSegment?.segmentId;
      if (segmentId) {
        await campaignQueue.add(
          "send-campaign",
          { campaignId: campaign.id, organizationId, segmentId },
          { delay: 0 }
        );
      }

      const data = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "running" as CampaignStatus },
      });
      return reply.send({ data });
    }
  );

  // ── Dry-run preview ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { segmentId?: SegmentId; limit?: number } }>(
    "/campaigns/:id/preview",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
        include: { segments: true },
      });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });

      const segmentId = request.body?.segmentId ?? campaign.segments[0]?.segmentId;
      const limit = Math.min(request.body?.limit ?? 10, 50);
      const templateBody = campaign.templateId ?? "";

      let previewContacts: Array<{ id: string; firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null }>;
      let totalReach = 0;

      if (segmentId) {
        const segment = await fastify.prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
        if (segment) {
          const phones = await evaluateSegment(fastify.prisma, organizationId, segment.filters as unknown as SegmentFilter[]);
          totalReach = phones.length;
          previewContacts = await fastify.prisma.contact.findMany({
            where: { organizationId, phoneNumber: { in: phones.slice(0, limit) } },
            select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
          });
        } else {
          previewContacts = [];
        }
      } else {
        previewContacts = await fastify.prisma.contact.findMany({
          where: { organizationId },
          select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
          take: limit,
        });
        totalReach = previewContacts.length;
      }

      const preview = previewContacts.map((c) => ({
        contactId: c.id,
        phone: c.phoneNumber,
        resolvedBody: templateBody
          .replace(/\{\{name\}\}/gi, [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phoneNumber)
          .replace(/\{\{phone\}\}/gi, c.phoneNumber)
          .replace(/\{\{email\}\}/gi, c.email ?? ""),
      }));

      return reply.send({ data: { totalReach, preview } });
    }
  );
};
