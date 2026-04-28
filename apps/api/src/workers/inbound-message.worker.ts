import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { getIo } from "../lib/io-ref.js";
import { evaluateRoutingRules } from "../lib/router.js";
import { transcribeAudio } from "../lib/whisper.js";
import { flowQueue } from "../lib/queue.js";

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
      timestamp,
    } = job.data;

    const messageDate = new Date(timestamp * 1000);

    let conversation = await prisma.conversation.findFirst({
      where: { organizationId, whatsappContactId: whatsappContactPhone },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId,
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

    if (contentType === "audio" && whatsappMessageId) {
      try {
        const transcript = await transcribeAudio(whatsappMessageId, process.env["WA_ACCESS_TOKEN"] ?? "");
        await prisma.message.update({ where: { id: storedMessage.id }, data: { body: transcript } });
      } catch {
        // Transcription failure is non-critical
      }
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: messageDate },
    });

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
  },
  { connection: redisConnection }
);
