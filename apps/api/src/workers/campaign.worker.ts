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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveTemplateVars(
  template: string,
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null }
): string {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber;
  return template
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

export const campaignWorker = new Worker<CampaignJob>(
  "campaigns",
  async (job) => {
    const { campaignId, organizationId, segmentId } = job.data;

    const [campaign, segment, org] = await Promise.all([
      prisma.campaign.findFirst({ where: { id: campaignId } }),
      prisma.segment.findFirst({ where: { id: segmentId, organizationId } }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
    ]);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (!segment) throw new Error(`Segment ${segmentId} not found`);

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

    const phones = await evaluateSegment(
      prisma,
      organizationId,
      segment.filters as unknown as SegmentFilter[]
    );

    const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
    const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";
    const templateBody = campaign.templateId ?? "";
    const intervalMs = (campaign.messageInterval ?? 1) * 1000;

    for (const phone of phones) {
      const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (current?.status === "paused" || current?.status === "aborted") break;

      let recipient = await prisma.campaignRecipient.findFirst({ where: { campaignId, phoneNumber: phone } });
      if (!recipient) {
        recipient = await prisma.campaignRecipient.create({
          data: { campaignId, organizationId, phoneNumber: phone, status: "pending" },
        });
      }
      if (recipient.status === "sent" || recipient.status === "delivered") continue;

      const contact = await prisma.contact.findFirst({
        where: { organizationId, phoneNumber: phone },
        select: { firstName: true, lastName: true, phoneNumber: true, email: true },
      });

      const body = contact ? resolveTemplateVars(templateBody, contact) : templateBody;

      try {
        const { messageId } = await sendTextMessage(phoneNumberId, phone, body, accessToken);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", sentAt: new Date(), messageId },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", errorMessage, retries: { increment: 1 } },
        });
      }

      await sleep(intervalMs);
    }

    const finalStatus = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (finalStatus?.status === "running") {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "completed", sentAt: new Date() },
      });
    }
  },
  { connection: redisConnection }
);
