import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { runFlow } from "../lib/flow-runner.js";
import type { FlowDefinition } from "../lib/flow-runner.js";

interface NoReplyJob {
  flowId: string;
  conversationId: string;
  organizationId: string;
  contactPhone?: string;
  scheduledAt: string;
}

export const noReplyWorker = new Worker<NoReplyJob>(
  "no-reply-checks",
  async (job) => {
    const { flowId, conversationId, organizationId, contactPhone, scheduledAt } = job.data;

    const flow = await prisma.flow.findFirst({ where: { id: flowId, isActive: true } });
    if (!flow) return;

    // Check no outbound message has been sent since this job was scheduled
    const scheduledDate = new Date(scheduledAt);
    const outboundSince = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: "outbound",
        sentAt: { gte: scheduledDate },
      },
    });
    if (outboundSince) return; // a reply was sent — don't fire

    await runFlow(prisma, flowId, flow.flowDefinition as unknown as FlowDefinition, {
      conversationId,
      organizationId,
      contactPhone,
    });
  },
  { connection: redisConnection }
);
