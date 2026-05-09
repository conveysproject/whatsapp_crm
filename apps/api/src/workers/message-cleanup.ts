import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";

export const messageCleanupQueue = new Queue("message-cleanup", { connection: redisConnection });
messageCleanupQueue.on("error", (err) => console.error(`[message-cleanup] queue error: ${err.message}`));

export function startMessageCleanupWorker() {
  const worker = new Worker(
    "message-cleanup",
    async () => {
      const settings = await prisma.vendorSetting.findMany({
        where: { key: "enable_automatic_message_deletion", value: "true" },
      });

      for (const setting of settings) {
        const daysSetting = await prisma.vendorSetting.findFirst({
          where: { organizationId: setting.organizationId, key: "delete_whatsapp_message_days" },
        });
        const days = parseInt(daysSetting?.value ?? "90", 10);
        const cutoff = new Date(Date.now() - days * 86400000);

        const result = await prisma.message.deleteMany({
          where: {
            organizationId: setting.organizationId,
            createdAt: { lt: cutoff },
          },
        });

        if (result.count > 0) {
          console.log(`[message-cleanup] org=${setting.organizationId} deleted=${result.count} messages older than ${days} days`);
        }
      }
    },
    { connection: redisConnection }
  );

  worker.on("error", (err) => console.error(`[message-cleanup] worker error: ${err.message}`));
  return worker;
}

export async function scheduleMessageCleanupCron() {
  await messageCleanupQueue.add(
    "daily-cleanup",
    {},
    {
      repeat: { pattern: "0 2 * * *" }, // 2am daily
      jobId: "message-cleanup-cron",
    }
  );
}
