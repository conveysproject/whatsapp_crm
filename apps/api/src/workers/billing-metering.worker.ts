import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { runMeteringSweep } from "../lib/billing/metering-sweep.js";

export { runMeteringSweep };

export const billingMeteringQueue = new Queue("billing-metering", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
});
billingMeteringQueue.on("error", (err) => console.error(`[billing-metering] queue error: ${err.message}`));

export function startBillingMeteringWorker() {
  const worker = new Worker(
    "billing-metering",
    async (job) => {
      // "nightly" re-sweeps the last 5 UTC days (keep below the 7-day retention minimum); "sweep" is yesterday + today.
      const res = job.name === "nightly" ? await runMeteringSweep(prisma, new Date(), 5) : await runMeteringSweep(prisma);
      if (res.days.length === 0) console.error("[billing-metering] sweep produced no days");
      else console.log(`[billing-metering] ${job.name} days=${res.days.length} upserted=${res.upserted} removed=${res.removed}`);
    },
    { connection: redisConnection, concurrency: 1 }
  );
  worker.on("error", (err) => console.error(`[billing-metering] worker error: ${err.message}`));
  return worker;
}

export async function scheduleBillingMeteringCron() {
  await billingMeteringQueue.add("sweep", {}, { repeat: { pattern: "5 * * * *" }, jobId: "billing-metering-cron" }); // minute 5 of every hour
  await billingMeteringQueue.add("nightly", {}, { repeat: { pattern: "35 0 * * *" }, jobId: "billing-metering-nightly-cron" }); // 00:35 UTC, last 5 days
}
