import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { getIo } from "../lib/io-ref.js";
import { evaluateRoutingRules } from "../lib/router.js";
import { transcribeAudio } from "../lib/whisper.js";
import { flowQueue } from "../lib/queue.js";
import { handleBotMessage } from "../lib/bot-runner.js";
import { getMediaUrl, downloadMediaBytes, markAsRead } from "../lib/whatsapp.js";
import { dispatchWebhook } from "../lib/webhook-dispatch.js";
import { isFeatureEnabled } from "../lib/plan-limits.js";
import Expo from "expo-server-sdk";

const expo = new Expo();

function isBotInWindow(startTime: string | undefined, endTime: string | undefined, timezone: string | undefined): boolean {
  if (!startTime || !endTime) return true; // no restriction configured
  const tz = timezone ?? "UTC";
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const currentMinutes = hour * 60 + minute;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
    const endMinutes = (eh ?? 0) * 60 + (em ?? 0);
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    // spans midnight
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } catch {
    return true;
  }
}

export interface InboundMessageJob {
  organizationId: string;
  whatsappContactPhone: string;
  whatsappMessageId: string;
  contentType: string;
  body: string | null;
  mediaId: string | null;
  timestamp: number;
}

export const inboundWorker = new Worker<InboundMessageJob>(
  "inbound-messages",
  async (job) => {
    const {
      organizationId,
      whatsappContactPhone,
      whatsappMessageId,
      contentType,
      body,
      mediaId,
      timestamp,
    } = job.data;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });

    const messageDate = new Date(timestamp * 1000);

    let conversation = await prisma.conversation.findFirst({
      where: { organizationId, whatsappContactId: whatsappContactPhone },
    });

    if (!conversation) {
      const existingContact = await prisma.contact.findFirst({
        where: { organizationId, phoneNumber: whatsappContactPhone, deletedAt: null },
        select: { id: true },
      });
      conversation = await prisma.conversation.create({
        data: {
          organizationId,
          contactId: existingContact?.id ?? null,
          whatsappContactId: whatsappContactPhone,
          channelType: "whatsapp",
          status: "open",
          lastMessageAt: messageDate,
        },
      });
      const assignment = await evaluateRoutingRules(prisma, {
        id: conversation.id,
        organizationId,
        whatsappContactId: whatsappContactPhone,
        status: "open",
        channelType: "whatsapp",
      });
      if (assignment) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { assignedTo: assignment.assignTo },
        });
        const ioEarly = getIo();
        ioEarly?.to(`org:${organizationId}`).emit("conversation:assigned", {
          conversationId: conversation.id,
          assignedTo: assignment.assignTo,
        });
        const profile = await prisma.user.findUnique({
          where: { id: assignment.assignTo },
          select: { pushToken: true },
        });
        if (profile?.pushToken && Expo.isExpoPushToken(profile.pushToken)) {
          await expo.sendPushNotificationsAsync([{
            to: profile.pushToken,
            title: whatsappContactPhone,
            body: (body ?? "New voice message").slice(0, 100),
            sound: "default",
          }]);
        }
      }
    }

    const storedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        organizationId,
        direction: "inbound",
        contentType,
        body,
        whatsappMessageId,
        status: "delivered",
        sentAt: messageDate,
      },
    });

    // Download media from Meta and store the URL on the message
    if (mediaId && org?.wabaAccessToken) {
      try {
        const { url: metaUrl } = await getMediaUrl(mediaId, org.wabaAccessToken);
        // Store the Meta URL (short-lived); replace with S3/R2 upload when storage is configured
        await prisma.message.update({ where: { id: storedMessage.id }, data: { mediaUrl: metaUrl } });
      } catch {
        // Media download failure is non-critical — message still stored
      }
    }

    if (contentType === "audio" && whatsappMessageId) {
      try {
        const transcript = await transcribeAudio(whatsappMessageId, process.env["WA_ACCESS_TOKEN"] ?? "");
        await prisma.message.update({ where: { id: storedMessage.id }, data: { body: transcript } });
      } catch {
        // Transcription failure is non-critical
      }
    }

    // Mark the message as read in WhatsApp
    if (whatsappMessageId && org?.phoneNumberId && org?.wabaAccessToken) {
      void markAsRead(org.phoneNumberId, whatsappMessageId, org.wabaAccessToken);
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: messageDate, unreadCount: { increment: 1 } },
    });

    const refreshed = await prisma.conversation.findFirst({ where: { id: conversation.id } });

    const botSettings = await prisma.vendorSetting.findMany({
      where: { organizationId, key: { in: ["enable_bot_timing_restrictions", "bot_start_timing", "bot_end_timing", "bot_timing_timezone"] } },
    });
    const botSettingMap = Object.fromEntries(botSettings.map((s) => [s.key, s.value ?? undefined]));
    const botRestricted = botSettingMap["enable_bot_timing_restrictions"] === "true";
    const botInWindow = !botRestricted || isBotInWindow(botSettingMap["bot_start_timing"], botSettingMap["bot_end_timing"], botSettingMap["bot_timing_timezone"]);

    const aiBotEnabled = await isFeatureEnabled(prisma, organizationId, "ai_chat_bot");
    if (aiBotEnabled && refreshed?.status === "bot" && botInWindow) {
      const io = getIo();
      io?.to(`org:${organizationId}`).emit("bot:triggered", { conversationId: conversation.id });
      try {
        await handleBotMessage(prisma, conversation.id, organizationId, body);
      } finally {
        io?.to(`org:${organizationId}`).emit("bot:completed", { conversationId: conversation.id });
      }
    }

    const activeFlows = await prisma.flow.findMany({
      where: { organizationId, isActive: true, triggerType: "inbound_message" },
      select: { id: true },
    });
    for (const flow of activeFlows) {
      await flowQueue.add("trigger-flow", {
        flowId: flow.id,
        payload: {
          conversationId: conversation.id,
          organizationId,
          contactPhone: whatsappContactPhone,
          messageBody: body ?? "",
        },
      });
    }

    const io = getIo();
    if (io) {
      io.to(`org:${organizationId}`).emit("new-message", {
        conversationId: conversation.id,
        organizationId,
        direction: "inbound",
        body,
        sentAt: messageDate.toISOString(),
      });
    }

    // Dispatch outbound webhook (plan-gated)
    void dispatchWebhook(organizationId, "message.inbound", {
      messageId: storedMessage.id,
      conversationId: conversation.id,
      contactPhone: whatsappContactPhone,
      body,
      contentType,
      sentAt: messageDate.toISOString(),
    });
  },
  { connection: redisConnection }
);
