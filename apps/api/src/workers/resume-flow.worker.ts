import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { runFlow } from "../lib/flow-runner.js";
import type { FlowDefinition, FlowTriggerPayload } from "../lib/flow-runner.js";

interface ResumeFlowJob {
  flowId: string;
  payload: FlowTriggerPayload;
}

export const resumeFlowWorker = new Worker<ResumeFlowJob>(
  "resume-flow",
  async (job) => {
    const { flowId, payload } = job.data;
    const flow = await prisma.flow.findFirst({ where: { id: flowId, isActive: true } });
    if (!flow) return;
    await runFlow(prisma, flowId, flow.flowDefinition as unknown as FlowDefinition, payload);
  },
  { connection: redisConnection }
);
