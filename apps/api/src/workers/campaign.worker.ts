import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { sendTextMessage, sendTemplateMessage } from "../lib/whatsapp.js";
import { buildTemplateComponents, contactBodyVars } from "../lib/template-components.js";
import { evaluateSegment, type FilterRule } from "../lib/segment-evaluator.js";
import { getIo } from "../lib/io-ref.js";

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
      prisma.campaign.findFirst({ where: { id: campaignId }, include: { segments: { take: 1 } } }),
      prisma.segment.findFirst({ where: { id: segmentId, organizationId } }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
    ]);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (!segment) throw new Error(`Segment ${segmentId} not found`);

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

    const evalResult = await evaluateSegment(
      prisma,
      organizationId,
      segment.filters as unknown as FilterRule[]
    );
    const phones = evalResult.contacts.map((c) => c.phoneNumber);

    const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
    const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";
    const isTemplateCampaign = campaign.campaignType === "template";
    const templateBody = campaign.templateId ?? "";
    const intervalMs = (campaign.messageInterval ?? 1) * 1000;

    // For template campaigns, load the approved template from DB including components
    type MetaTemplate = { name: string; language: string; metaTemplateId: string | null; components: unknown[] };
    let metaTemplate: MetaTemplate | null = null;
    if (isTemplateCampaign && campaign.templateId) {
      const row = await prisma.template.findUnique({
        where: { id: campaign.templateId },
        select: { name: true, language: true, metaTemplateId: true, components: true },
      });
      if (row) {
        metaTemplate = { ...row, components: (row.components ?? []) as unknown[] };
      }
    }
    const total = phones.length;
    let sent = 0;
    let failed = 0;

    function emitProgress() {
      const io = getIo();
      if (!io) return;
      const percentage = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
      io.to(`org:${organizationId}`).emit("campaign:progress", { campaignId, sent, failed, total, percentage });
    }

    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i]!;
      const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (current?.status === "paused" || current?.status === "aborted") {
        getIo()?.to(`org:${organizationId}`).emit("campaign:aborted", { campaignId });
        break;
      }

      let recipient = await prisma.campaignRecipient.findFirst({ where: { campaignId, phoneNumber: phone } });
      if (!recipient) {
        recipient = await prisma.campaignRecipient.create({
          data: { campaignId, organizationId, phoneNumber: phone, status: "pending" },
        });
      }
      if (recipient.status === "sent" || recipient.status === "delivered") { sent++; continue; }

      const contact = await prisma.contact.findFirst({
        where: { organizationId, phoneNumber: phone },
        select: { firstName: true, lastName: true, phoneNumber: true, email: true },
      });

      const body = contact ? resolveTemplateVars(templateBody, contact) : templateBody;

      try {
        let messageId: string;
        if (isTemplateCampaign && metaTemplate?.metaTemplateId) {
          const stored = (metaTemplate.components ?? []) as unknown[];
          const bodyVarCount = (() => {
            const bodyComp = (stored as Array<{ type?: string; text?: string }>).find(
              (c) => c.type?.toUpperCase() === "BODY"
            );
            return bodyComp?.text ? (bodyComp.text.match(/\{\{\d+\}\}/g) ?? []).length : 0;
          })();
          const bodyVars = contact ? contactBodyVars(contact, bodyVarCount) : [];
          const components = buildTemplateComponents(stored, { body: bodyVars });
          ({ messageId } = await sendTemplateMessage(
            phoneNumberId, phone, metaTemplate.name, metaTemplate.language, components, accessToken
          ));
        } else {
          ({ messageId } = await sendTextMessage(phoneNumberId, phone, body, accessToken));
        }
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", sentAt: new Date(), messageId },
        });
        sent++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", errorMessage, retries: { increment: 1 } },
        });
        failed++;
      }

      // Emit progress every 50 messages
      if ((i + 1) % 50 === 0) emitProgress();

      await sleep(intervalMs);
    }

    // Final progress emission
    emitProgress();

    const finalStatus = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (finalStatus?.status === "running") {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "completed", sentAt: new Date() },
      });
      getIo()?.to(`org:${organizationId}`).emit("campaign:completed", { campaignId, sent, failed, total });
    }
  },
  { connection: redisConnection }
);
