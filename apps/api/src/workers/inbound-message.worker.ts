import { Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { getIo } from "../lib/io-ref.js";
import { evaluateRoutingRules } from "../lib/router.js";
import { transcribeAudio } from "../lib/whisper.js";
import { handleBotMessage } from "../lib/bot-runner.js";
import { getMediaUrl, markAsRead, sendTextMessage } from "../lib/whatsapp.js";
import { recordOutbound } from "../lib/record-outbound.js";
import { dispatchWebhook } from "../lib/webhook-dispatch.js";
import { isFeatureEnabled } from "../lib/plan-limits.js";
import { dispatchFlowTrigger, cancelNoReplyJobs } from "../lib/trigger-dispatcher.js";
import { runFlow } from "../lib/flow-runner.js";
import type { FlowDefinition, FlowSession } from "../lib/flow-runner.js";
import Expo from "expo-server-sdk";

function interpolateAutoReply(
  text: string,
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null } | null
): string {
  if (!contact) return text;
  const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return text
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

function matchesAutoReply(triggerType: string, triggerKeyword: string, body: string): boolean {
  const lc = body.toLowerCase();
  const kw = triggerKeyword.toLowerCase();
  switch (triggerType) {
    case "contains": return lc.includes(kw);
    case "is": return lc === kw;
    case "starts_with": return lc.startsWith(kw);
    case "ends_with": return lc.endsWith(kw);
    case "regex": {
      try { return new RegExp(triggerKeyword, "i").test(body); } catch { return false; }
    }
    default: return false;
  }
}

const expo = new Expo();

function isBotInWindow(startTime: string | undefined, endTime: string | undefined, timezone: string | undefined): boolean {
  if (!startTime || !endTime) return true;
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
    if (startMinutes <= endMinutes) return currentMinutes >= startMinutes && currentMinutes < endMinutes;
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
    const { organizationId, whatsappContactPhone, whatsappMessageId, contentType, body, mediaId, timestamp } = job.data;
    console.log(`[worker:inbound] START wamid=${whatsappMessageId} from=${whatsappContactPhone} type=${contentType} body=${JSON.stringify(body)}`);

    try {

    // Idempotency: skip if this wamid was already stored (Meta delivers at-least-once)
    if (whatsappMessageId) {
      const existing = await prisma.message.findUnique({ where: { whatsappMessageId }, select: { id: true } });
      if (existing) {
        console.log(`[worker:inbound] SKIP duplicate wamid=${whatsappMessageId}`);
        return;
      }
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });

    const messageDate = new Date(timestamp * 1000);

    // Ensure a contact record always exists for this phone number so that
    // flow actions (add_label, update_stage, opt_out, etc.) can find it.
    const contact = await prisma.contact.upsert({
      where: { organizationId_phoneNumber: { organizationId, phoneNumber: whatsappContactPhone } },
      create: { organizationId, phoneNumber: whatsappContactPhone },
      update: {},
      select: { id: true },
    });

    let conversation = await prisma.conversation.findFirst({
      where: { organizationId, whatsappContactId: whatsappContactPhone },
    });

    let isNewConversation = false;

    // Backfill contactId on pre-existing conversations that were created without one
    if (conversation && !conversation.contactId) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { contactId: contact.id },
      });
    }

    if (!conversation) {
      isNewConversation = true;
      conversation = await prisma.conversation.create({
        data: {
          organizationId,
          contactId: contact.id,
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
          const tickets = await expo.sendPushNotificationsAsync([{
            to: profile.pushToken,
            title: whatsappContactPhone,
            body: (body ?? "New voice message").slice(0, 100),
            sound: "default",
          }]);
          const shouldDelete = tickets.some(
            (t) => t.status === "error" && (t.details as { error?: string } | undefined)?.error === "DeviceNotRegistered"
          );
          if (shouldDelete) {
            await prisma.user.update({ where: { id: assignment.assignTo }, data: { pushToken: null } });
          }
        }
      }

      // Trigger new_conversation flows
      await dispatchFlowTrigger(prisma, organizationId, "new_conversation", {
        conversationId: conversation.id,
        organizationId,
        contactPhone: whatsappContactPhone,
        messageBody: body ?? "",
      });
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

    if (mediaId && org?.wabaAccessToken) {
      try {
        const { url: metaUrl } = await getMediaUrl(mediaId, org.wabaAccessToken);
        await prisma.message.update({ where: { id: storedMessage.id }, data: { mediaUrl: metaUrl } });
      } catch {
        // Media download failure is non-critical
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

    if (whatsappMessageId && org?.phoneNumberId && org?.wabaAccessToken) {
      void markAsRead(org.phoneNumberId, whatsappMessageId, org.wabaAccessToken);
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: messageDate, lastInboundAt: messageDate, unreadCount: { increment: 1 } },
    });

    const refreshed = await prisma.conversation.findFirst({ where: { id: conversation.id } });

    // --- Flow session resume: takes priority over all other processing ---
    const flowSession = refreshed?.flowSession as FlowSession | null | undefined;
    console.log(`[inbound] conv=${conversation.id} type=${contentType} body=${JSON.stringify(body)} session=${JSON.stringify(flowSession ?? null)}`);
    if (flowSession?.flowId && flowSession.waitingAtNodeId) {
      // ask_question resumes on any message type; button/list nodes only on interactive replies
      const acceptsText = flowSession.waitingNodeType === "ask_question";
      if (!acceptsText && contentType !== "interactive") {
        // Text arrived while waiting for a button — clear the stale session so normal
        // flow dispatch below can re-trigger the flow from scratch
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { flowSession: Prisma.JsonNull },
        });
        // fall through to normal auto-reply / flow dispatch
      } else {
        const flow = await prisma.flow.findFirst({ where: { id: flowSession.flowId } });
        if (flow?.isActive) {
          // Clear session first so a crash doesn't loop
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { flowSession: Prisma.JsonNull },
          });
          await runFlow(prisma, flow.id, flow.flowDefinition as unknown as FlowDefinition, {
            conversationId: conversation.id,
            organizationId,
            contactPhone: whatsappContactPhone,
            messageBody: body ?? "",
            resumeFromNodeId: flowSession.waitingAtNodeId,
          });
        }
        const io = getIo();
        io?.to(`org:${organizationId}`).emit("new-message", {
          conversationId: conversation.id,
          organizationId,
          direction: "inbound",
          body,
          sentAt: messageDate.toISOString(),
        });
        return;
      }
    }

    // --- Auto-reply evaluation (keyword-triggered instant replies) ---
    // If an auto-reply fires, skip inbound_message/keyword_match flow dispatches below
    // to prevent the same flow running twice when flowId is set on the auto-reply.
    let autoRepliedWithFlow = false;
    if (body && refreshed?.status !== "bot") {
      const autoReplies = await prisma.autoReply.findMany({
        where: { organizationId, isActive: true },
        orderBy: { priorityIndex: "asc" },
      });
      const matched = autoReplies.find((ar) => matchesAutoReply(ar.triggerType, ar.triggerKeyword, body));
      if (matched) {
        const arContact = await prisma.contact.findFirst({
          where: { organizationId, phoneNumber: whatsappContactPhone },
          select: { firstName: true, lastName: true, phoneNumber: true, email: true },
        });
        const replyText = interpolateAutoReply(matched.replyText, arContact);
        if (replyText && org?.phoneNumberId && org?.wabaAccessToken) {
          const { messageId } = await sendTextMessage(org.phoneNumberId, whatsappContactPhone, replyText, org.wabaAccessToken);
          await recordOutbound(prisma, { conversationId: conversation.id, organizationId, contentType: "text", body: replyText, whatsappMessageId: messageId });
        }
        if (matched.flowId) {
          const arFlow = await prisma.flow.findFirst({ where: { id: matched.flowId, isActive: true } });
          if (arFlow) {
            autoRepliedWithFlow = true;
            await runFlow(prisma, arFlow.id, arFlow.flowDefinition as unknown as FlowDefinition, {
              conversationId: conversation.id,
              organizationId,
              contactPhone: whatsappContactPhone,
              messageBody: body,
            });
          }
        }
      }
    }

    // --- Bot handling ---
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

    // --- Flow triggers (skip for new conversations — already fired above) ---
    if (!isNewConversation) {
      const dispatchPayload = {
        conversationId: conversation.id,
        organizationId,
        contactPhone: whatsappContactPhone,
        messageBody: body ?? "",
        contentType,
      };

      // Skip inbound_message/keyword_match if an auto-reply already ran a flow —
      // prevents the same flow executing twice for one message.
      if (!autoRepliedWithFlow) {
        await dispatchFlowTrigger(prisma, organizationId, "inbound_message", dispatchPayload);
        await dispatchFlowTrigger(prisma, organizationId, "keyword_match", dispatchPayload);
      }

      if (contentType === "interactive") {
        await dispatchFlowTrigger(prisma, organizationId, "button_reply", dispatchPayload);
      }

      // Schedule no-reply check flows (cancel existing first to reset timer)
      await cancelNoReplyJobs(conversation.id);
      await dispatchFlowTrigger(prisma, organizationId, "no_reply", dispatchPayload);
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

    void dispatchWebhook(organizationId, "message.inbound", {
      messageId: storedMessage.id,
      conversationId: conversation.id,
      contactPhone: whatsappContactPhone,
      body,
      contentType,
      sentAt: messageDate.toISOString(),
    });
    console.log(`[worker:inbound] DONE wamid=${whatsappMessageId} msgId=${storedMessage.id}`);

    } catch (err) {
      console.error(`[worker:inbound] ERROR wamid=${whatsappMessageId} from=${whatsappContactPhone} type=${contentType}`, err);
      throw err;
    }
  },
  { connection: redisConnection }
);
