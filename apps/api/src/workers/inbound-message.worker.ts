import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { getIo } from "../lib/io-ref.js";
import { evaluateRoutingRules } from "../lib/router.js";

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

    await prisma.message.create({
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

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: messageDate },
    });

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
