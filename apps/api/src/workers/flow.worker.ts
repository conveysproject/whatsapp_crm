import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { runFlow, type FlowDefinition, type FlowTriggerPayload } from "../lib/flow-runner.js";

interface FlowJob {
  flowId: string;
  payload: FlowTriggerPayload;
}

export const flowWorker = new Worker<FlowJob>(
  "flows",
  async (job) => {
    const { flowId, payload } = job.data;
    console.log(`[flow-worker] job ${job.id} flowId=${flowId} conv=${payload.conversationId}`);
    const flow = await prisma.flow.findFirst({ where: { id: flowId } });
    if (!flow || !flow.isActive) {
      console.log(`[flow-worker] flow ${flowId} not found or inactive`);
      return;
    }
    try {
      await runFlow(prisma, flowId, flow.flowDefinition as unknown as FlowDefinition, payload);
      console.log(`[flow-worker] flow ${flowId} completed`);
    } catch (err) {
      console.error(`[flow-worker] flow ${flowId} error:`, err instanceof Error ? err.message : err);
      throw err;
    }
  },
  { connection: redisConnection }
);
