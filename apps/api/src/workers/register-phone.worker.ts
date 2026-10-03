import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import {
  FIRST_CHECK_DELAY_MS,
  processOrg,
  randomPin,
  selectEligibleOrgIds,
  type Deps,
} from "../lib/auto-register-phone.js";

const SWEEP_LIMIT = 20;

export const registerPhoneQueue = new Queue("register-phone", {
  connection: redisConnection,
  // Ids are freed as soon as a job ends so the next delayed check for the same org can be added.
  defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
});
registerPhoneQueue.on("error", (err) => console.error(`[register-phone] queue error: ${err.message}`));

/**
 * Schedule one check for an org. jobId is org + minute bucket, so repeated enqueues for the same
 * moment collapse into one job (BullMQ ignores a duplicate jobId); '-' not ':' (BullMQ custom ids).
 */
export async function enqueueRegisterCheck(orgId: string, delayMs: number = FIRST_CHECK_DELAY_MS): Promise<void> {
  const bucket = Math.round((Date.now() + delayMs) / 60_000);
  await registerPhoneQueue.add("check", { orgId }, { delay: delayMs, jobId: `register-phone-${orgId}-${bucket}` });
}

const lockKey = (orgId: string) => `register-phone:lock:${orgId}`;

function buildDeps(): Deps {
  return {
    getSettings: async (orgId) => {
      const rows = await prisma.vendorSetting.findMany({ where: { organizationId: orgId }, select: { key: true, value: true } });
      return Object.fromEntries(rows.flatMap((r) => (r.value == null ? [] : [[r.key, r.value] as const])));
    },
    setSettings: async (orgId, kv) => {
      await Promise.all(
        Object.entries(kv).map(([key, value]) =>
          prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId: orgId, key } },
            create: { organizationId: orgId, key, value, dataType: "string" },
            update: { value },
          })
        )
      );
    },
    acquireLock: async (orgId) => (await redisConnection.set(lockKey(orgId), "1", "EX", 120, "NX")) === "OK",
    releaseLock: async (orgId) => { await redisConnection.del(lockKey(orgId)); },
    fetchFn: fetch,
    audit: async (e) => {
      // Audit failures must not stop registration bookkeeping; log and continue.
      await prisma.adminAuditLog
        .create({ data: { ...e, metadata: e.metadata as object } })
        .catch((err: unknown) => console.error("[register-phone] audit write failed", err));
    },
    now: () => new Date(),
    randomPin,
  };
}

export function startRegisterPhoneWorker() {
  const deps = buildDeps();
  const worker = new Worker(
    "register-phone",
    async (job) => {
      if (job.name === "sweep") {
        // Database only: enqueue the orgs that are due; no Meta calls here.
        const ids = await selectEligibleOrgIds(prisma, new Date(), SWEEP_LIMIT);
        for (const orgId of ids) await enqueueRegisterCheck(orgId, 0);
        if (ids.length > 0) console.log(`[register-phone] sweep queued ${ids.length} org(s)`);
        return;
      }
      const { orgId } = job.data as { orgId: string };
      const result = await processOrg(deps, orgId);
      console.log(`[register-phone] org=${orgId} outcome=${result.outcome}`);
      if (result.nextDelayMs !== null) await enqueueRegisterCheck(orgId, result.nextDelayMs);
    },
    { connection: redisConnection, concurrency: 1 }
  );
  worker.on("error", (err) => console.error(`[register-phone] worker error: ${err.message}`));
  return worker;
}

export async function scheduleRegisterPhoneSweepCron() {
  await registerPhoneQueue.add(
    "sweep",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "register-phone-sweep-cron" } // 3am daily
  );
}
