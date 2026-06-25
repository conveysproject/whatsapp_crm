import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { isWithinBusinessHours } from "../lib/automation-trigger.js";
import { sendTextMessage } from "../lib/whatsapp.js";
import { recordOutbound } from "../lib/record-outbound.js";

export interface DelayedResponseJob {
  conversationId: string;
  organizationId: string;
  scheduledAt: string; // ISO string — used to check if agent replied since scheduling
}

export const delayedResponseWorker = new Worker<DelayedResponseJob>(
  "delayed-response",
  async (job) => {
    const { conversationId, organizationId, scheduledAt } = job.data;

    // 1. Load settings
    const settings = await prisma.orgAutomationSettings.findUnique({
      where: { organizationId },
    });
    if (!settings?.delayedEnabled || !settings.delayedMessage) return;

    // 2. Check if agent replied since job was scheduled
    const scheduledDate = new Date(scheduledAt);
    const outboundSince = await prisma.message.findFirst({
      where: {
        conversationId,
        organizationId,
        direction: "outbound",
        sentAt: { gte: scheduledDate },
      },
    });
    if (outboundSince) return; // agent replied — skip

    // 3. Check if conversation is still open
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true, status: true, whatsappContactId: true },
    });
    if (!conversation || conversation.status !== "open") return;

    // 4. Business hours check
    const now = new Date();
    const withinHours = await isWithinBusinessHours(prisma, organizationId, now);
    if (!withinHours && !settings.delayedSendWithOoo) return;

    // 5. Load org credentials
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    if (!org?.phoneNumberId || !org?.wabaAccessToken) return;

    // 6. Interpolate contact variables into message
    const contact = await prisma.contact.findFirst({
      where: { organizationId, phoneNumber: conversation.whatsappContactId },
      select: { firstName: true, lastName: true, phoneNumber: true, email: true },
    });
    const message = interpolate(settings.delayedMessage, contact);

    // 7. Send
    const { messageId } = await sendTextMessage(
      org.phoneNumberId,
      conversation.whatsappContactId,
      message,
      org.wabaAccessToken
    );

    await recordOutbound(prisma, {
      conversationId,
      organizationId,
      contentType: "text",
      body: message,
      whatsappMessageId: messageId,
    });
  },
  { connection: redisConnection }
);

delayedResponseWorker.on("failed", (job, err) => {
  console.error(`[delayed-response] job ${job?.id} failed:`, err);
});

function interpolate(
  template: string,
  contact: {
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    email: string | null;
  } | null
): string {
  if (!contact) return template;
  const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return template
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}
