import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { summarizeConversation } from "../lib/claude.js";

export interface ConversationSummaryJob {
  conversationId: string;
  organizationId: string;
}

export const conversationSummaryWorker = new Worker<ConversationSummaryJob>(
  "conversation-summary",
  async (job) => {
    const { conversationId, organizationId } = job.data;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      include: { contact: { select: { id: true, pastAiSummary: true } } },
    });
    if (!conversation?.contact) return;

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: "asc" },
      take: 100,
      select: { body: true, direction: true, sentAt: true },
    });
    if (messages.length === 0) return;

    const summary = await summarizeConversation(messages, conversation.contact.pastAiSummary);
    if (summary) {
      await prisma.contact.update({
        where: { id: conversation.contact.id },
        data: { pastAiSummary: summary },
      });
    }
  },
  { connection: redisConnection }
);

conversationSummaryWorker.on("failed", (job, err) => {
  console.error(`[conversation-summary] job ${job?.id} failed:`, err);
});
