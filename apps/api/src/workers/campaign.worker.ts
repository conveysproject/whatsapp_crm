import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { sendTextMessage, sendTemplateMessage } from "../lib/whatsapp.js";
import { buildTemplateComponents, contactBodyVars } from "../lib/template-components.js";
import { evaluateSegment, type FilterRule } from "../lib/segment-evaluator.js";
import { getIo } from "../lib/io-ref.js";
import { recordOutbound } from "../lib/record-outbound.js";

interface CampaignJob {
  campaignId: string;
  organizationId: string;
  segmentId?: string;
  groupIds?: string[];
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
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

async function resolveTargetPhones(
  campaignId: string,
  organizationId: string,
  segmentId?: string,
  groupIds?: string[]
): Promise<string[]> {
  // Mode 1: segment
  if (segmentId) {
    const segment = await prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
    if (!segment) throw new Error(`Segment ${segmentId} not found`);
    const result = await evaluateSegment(prisma, organizationId, segment.filters as unknown as FilterRule[]);
    return result.contacts.map((c) => c.phoneNumber);
  }

  // Mode 2: explicit groupIds from job payload
  const effectiveGroupIds = groupIds && groupIds.length > 0 ? groupIds : null;

  // Mode 3: groups stored on the campaign (set at create/schedule time)
  const storedGroups = effectiveGroupIds
    ? null
    : await prisma.campaignGroup.findMany({ where: { campaignId }, select: { contactGroupId: true } });

  const resolvedGroupIds = effectiveGroupIds ?? storedGroups?.map((g) => g.contactGroupId) ?? [];

  if (resolvedGroupIds.length > 0) {
    const groupContacts = await prisma.groupContact.findMany({
      where: { contactGroupId: { in: resolvedGroupIds } },
      include: { contact: { select: { phoneNumber: true } } },
    });
    return [...new Set(groupContacts.map((gc) => gc.contact.phoneNumber))];
  }

  // Mode 4: all org contacts
  const allContacts = await prisma.contact.findMany({
    where: { organizationId, whatsappOptOut: false },
    select: { phoneNumber: true },
  });
  return allContacts.map((c) => c.phoneNumber);
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("429") || msg.includes("rate limit")) return true;
  if (msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("etimedout")) return true;
  if (msg.includes("network") || msg.includes("socket hang up")) return true;
  return false;
}

export const campaignWorker = new Worker<CampaignJob>(
  "campaigns",
  async (job) => {
    const { campaignId, organizationId, segmentId, groupIds } = job.data;

    const [campaign, org] = await Promise.all([
      prisma.campaign.findFirst({ where: { id: campaignId }, include: { segments: { take: 1 } } }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
    ]);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

    const phones = await resolveTargetPhones(campaignId, organizationId, segmentId, groupIds);

    const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
    const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";
    const isTemplateCampaign = campaign.campaignType === "template";
    const templateBody = campaign.templateId ?? "";
    const intervalMs = (campaign.messageInterval ?? 1) * 1000;

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

      // Enforce campaign-level message expiry (expiresAt field on Campaign model)
      if (campaign.expiresAt && new Date() > campaign.expiresAt) {
        await prisma.campaignRecipient.updateMany({
          where: { campaignId, status: "pending" },
          data: { status: "expired" },
        });
        getIo()?.to(`org:${organizationId}`).emit("campaign:expired", { campaignId });
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
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
      });

      if (contact && (!recipient.fullName || !recipient.contactId)) {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { contactId: contact.id, fullName },
        });
        recipient = { ...recipient, contactId: contact.id, fullName };
      }

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

        // Ensure an inbox conversation exists so agents can see outbound campaign messages
        let conv = await prisma.conversation.findFirst({
          where: { organizationId, whatsappContactId: phone },
          select: { id: true, status: true },
        });
        if (!conv) {
          conv = await prisma.conversation.create({
            data: {
              organizationId,
              contactId: contact?.id ?? null,
              whatsappContactId: phone,
              channelType: "whatsapp",
              status: "open",
              lastMessageAt: new Date(),
            },
            select: { id: true, status: true },
          });
        } else if (conv.status === "closed") {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { status: "open" },
          });
        }
        const contentType = isTemplateCampaign ? "template" : "text";
        await recordOutbound(prisma, {
          conversationId: conv.id,
          organizationId,
          contentType,
          body,
          whatsappMessageId: messageId,
        });

        sent++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (isTransientError(err) && (recipient.retries ?? 0) < 3) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "pending", errorMessage, retries: { increment: 1 } },
          });
          await sleep(2000);
        } else {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "failed", errorMessage, retries: { increment: 1 } },
          });
          failed++;
        }
      }

      if ((i + 1) % 50 === 0) emitProgress();
      await sleep(intervalMs);
    }

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
