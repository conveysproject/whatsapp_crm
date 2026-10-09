import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { cleanupApiRequestLogs } from "../lib/public-api/usage-cleanup.js";
import { cleanupApiPayloads } from "../lib/public-api/payload-cleanup.js";

export const messageCleanupQueue = new Queue("message-cleanup", { connection: redisConnection });
messageCleanupQueue.on("error", (err) => console.error(`[message-cleanup] queue error: ${err.message}`));

export function startMessageCleanupWorker() {
  const worker = new Worker(
    "message-cleanup",
    async (job) => {
      if (job.name === "recover-stuck") {
        await recoverStuckMessages();
        return;
      }
      if (job.name === "api-usage-cleanup") {
        const deleted = await cleanupApiRequestLogs(prisma);
        if (deleted > 0) console.log(`[message-cleanup] deleted ${deleted} expired API request log rows`);
        // Payload/attempt retention is independent and runs after the request-log purge; its failure must not fail the job.
        try {
          const deletedPayloads = await cleanupApiPayloads(prisma);
          if (deletedPayloads > 0) console.log(`[message-cleanup] deleted ${deletedPayloads} expired API payload rows`);
        } catch (err) {
          console.error(`[message-cleanup] api payload cleanup failed: ${err instanceof Error ? err.name : "UnknownError"}`);
        }
        return;
      }
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
  // Every 5 minutes: reset messages stuck in "sending" state
  await messageCleanupQueue.add(
    "recover-stuck",
    {},
    {
      repeat: { pattern: "*/5 * * * *" },
      jobId: "message-stuck-recovery-cron",
    }
  );
}

/**
 * Hourly purge of raw public-API request logs past the retention (time-budgeted, see cleanupApiRequestLogs). A separate job
 * name on the shared queue; scheduled only when PUBLIC_API_ENABLED=true (see index.ts).
 */
export async function scheduleApiUsageCleanupCron() {
  await messageCleanupQueue.add(
    "api-usage-cleanup",
    {},
    {
      repeat: { pattern: "30 * * * *", tz: "UTC" }, // minute 30 of every hour, UTC
      jobId: "api-usage-cleanup-cron",
    }
  );
}

export async function recoverStuckMessages(): Promise<void> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  // GAP-S48: messages stuck in "sending" for >5 min are expired (not failed — timeout, not error)
  const result = await prisma.message.updateMany({
    where: { status: "sending", createdAt: { lt: fiveMinutesAgo } },
    data: { status: "expired" },
  });
  if (result.count > 0) {
    console.log(`[message-cleanup] expired ${result.count} stuck messages`);
  }
}
