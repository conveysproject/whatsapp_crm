import type { FastifyPluginAsync } from "fastify";
import type { CampaignStatus } from "@prisma/client";
import { campaignQueue } from "../lib/queue.js";
import type { CampaignId, SegmentId, TemplateId } from "@trustcrm/shared";

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
};
