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
    const flow = await prisma.flow.findFirst({ where: { id: flowId } });
    if (!flow || !flow.isActive) return;
    await runFlow(prisma, flow.flowDefinition as unknown as FlowDefinition, payload);
  },
  { connection: redisConnection }
);
