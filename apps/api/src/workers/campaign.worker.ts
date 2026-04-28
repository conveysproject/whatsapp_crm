import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { sendTextMessage } from "../lib/whatsapp.js";
import { evaluateSegment, type SegmentFilter } from "../lib/segment-evaluator.js";

interface CampaignJob {
  campaignId: string;
  organizationId: string;
  segmentId: string;
}

export const campaignWorker = new Worker<CampaignJob>(
  "campaigns",
  async (job) => {
    const { campaignId, organizationId, segmentId } = job.data;

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

    const segment = await prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
    if (!segment) throw new Error(`Segment ${segmentId} not found`);

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } });
    const templateName = campaign?.templateId ?? campaignId;

    const phones = await evaluateSegment(
      prisma,
      organizationId,
      segment.filters as unknown as SegmentFilter[]
    );

    const phoneNumberId = process.env["WA_PHONE_NUMBER_ID"] ?? "";
    const accessToken = process.env["WA_ACCESS_TOKEN"] ?? "";

    for (const phone of phones) {
      try {
        await sendTextMessage(phoneNumberId, phone, templateName, accessToken);
      } catch {
        // continue on per-contact failure
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "completed", sentAt: new Date() },
    });
  },
  { connection: redisConnection }
);
