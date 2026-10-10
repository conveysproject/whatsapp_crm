import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { expireGraceOrgs } from "../lib/billing/grace.js";

export const billingGraceQueue = new Queue("billing-grace", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
});
billingGraceQueue.on("error", (err) => console.error(`[billing-grace] queue error: ${err.message}`));

export function startBillingGraceWorker() {
  const worker = new Worker(
    "billing-grace",
    async () => {
      const ids = await expireGraceOrgs(prisma);
      if (ids.length > 0) console.log(`[billing-grace] downgraded ${ids.length} org(s): ${ids.join(",")}`);
    },
    { connection: redisConnection, concurrency: 1 }
  );
  worker.on("error", (err) => console.error(`[billing-grace] worker error: ${err.message}`));
  return worker;
}

export async function scheduleBillingGraceCron() {
  await billingGraceQueue.add("sweep", {}, { repeat: { pattern: "0 4 * * *" }, jobId: "billing-grace-cron" }); // 4am daily
}
