import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { runMeteringSweep } from "../lib/billing/metering-sweep.js";
import { evaluateAlerts } from "../lib/billing/alerts.js";
import { generateStatements } from "../lib/billing/statements.js";
import { utcDayStart } from "../lib/billing/metering.js";

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
      if (job.name === "statements") {
        // Daily: prepare DRAFT statements for the organizations whose billing cycle ended today. The two days before are
        // repeated so a missed run is caught up (idempotent). Never charges.
        const today = utcDayStart(new Date());
        for (let back = 2; back >= 0; back--) {
          const res = await generateStatements(prisma, new Date(today.getTime() - back * 86_400_000));
          if (res.created + res.refreshed + res.skipped > 0) console.log(`[billing-statements] day-${back} created=${res.created} refreshed=${res.refreshed} skipped=${res.skipped}`);
        }
        return;
      }
      // "nightly" re-sweeps the last 5 UTC days (keep below the 7-day retention minimum); "sweep" is yesterday + today.
      const res = job.name === "nightly" ? await runMeteringSweep(prisma, new Date(), 5) : await runMeteringSweep(prisma);
      if (res.days.length === 0) console.error("[billing-metering] sweep produced no days");
      else console.log(`[billing-metering] ${job.name} days=${res.days.length} upserted=${res.upserted} removed=${res.removed}`);
      if (job.name === "sweep") {
        const al = await evaluateAlerts(prisma);
        if (al.recorded > 0 || al.emailed > 0) console.log(`[billing-alerts] recorded=${al.recorded} emailed=${al.emailed}`);
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );
  worker.on("error", (err) => console.error(`[billing-metering] worker error: ${err.message}`));
  return worker;
}

export async function scheduleBillingMeteringCron() {
  await billingMeteringQueue.add("sweep", {}, { repeat: { pattern: "5 * * * *" }, jobId: "billing-metering-cron" }); // minute 5 of every hour
  await billingMeteringQueue.add("nightly", {}, { repeat: { pattern: "35 0 * * *" }, jobId: "billing-metering-nightly-cron" }); // 00:35 UTC, last 5 days
  await billingMeteringQueue.add("statements", {}, { repeat: { pattern: "50 0 * * *" }, jobId: "billing-statements-daily-cron" }); // 00:50 UTC every day
}
