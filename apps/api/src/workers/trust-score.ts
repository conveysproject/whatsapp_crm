import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";

export const trustScoreQueue = new Queue("trust-score", { connection: redisConnection });
trustScoreQueue.on("error", (err) => console.error(`[trust-score] queue error: ${err.message}`));

export async function computeOrgScore(organizationId: string): Promise<{
  score: number;
  breakdown: { deliveryScore: number; responseScore: number; contactScore: number; campaignScore: number };
}> {
  const [totalMessages, deliveredMessages, inboundMessages, totalContacts, contactsWithTags, campaigns] =
    await Promise.all([
      prisma.message.count({ where: { organizationId, direction: "outbound" } }),
      prisma.message.count({ where: { organizationId, direction: "outbound", status: "delivered" } }),
      prisma.message.count({ where: { organizationId, direction: "inbound" } }),
      prisma.contact.count({ where: { organizationId, deletedAt: null } }),
      prisma.contact.count({ where: { organizationId, deletedAt: null, tags: { isEmpty: false } } }),
      prisma.campaign.findMany({
        where: { organizationId, status: "completed" },
        select: { id: true },
        take: 50,
      }),
    ]);

  const deliveryRate = totalMessages > 0 ? deliveredMessages / totalMessages : 0;
  const deliveryScore = Math.round(deliveryRate * 30);

  const responseRate = totalMessages > 0 ? Math.min(1, inboundMessages / totalMessages) : 0;
  const responseScore = Math.round(responseRate * 25);

  const contactQualityRate = totalContacts > 0 ? contactsWithTags / totalContacts : 0;
  const contactScore = Math.round(contactQualityRate * 25);

  const campaignScore = Math.min(20, campaigns.length * 2);

  return {
    score: deliveryScore + responseScore + contactScore + campaignScore,
    breakdown: { deliveryScore, responseScore, contactScore, campaignScore },
  };
}

export function startTrustScoreWorker() {
  const worker = new Worker(
    "trust-score",
    async () => {
      const orgs = await prisma.organization.findMany({ select: { id: true } });
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      for (const org of orgs) {
        const existing = await prisma.orgTrustScoreSnapshot.findFirst({
          where: { organizationId: org.id, recordedAt: { gte: todayStart } },
        });
        if (existing) continue;

        const { score, breakdown } = await computeOrgScore(org.id);
        await prisma.orgTrustScoreSnapshot.create({
          data: { organizationId: org.id, score, breakdown },
        });
        console.log(`[trust-score] org=${org.id} score=${score}`);
      }
    },
    { connection: redisConnection }
  );
  worker.on("error", (err) => console.error(`[trust-score] worker error: ${err.message}`));
  return worker;
}

export async function scheduleTrustScoreCron(): Promise<void> {
  await trustScoreQueue.add(
    "daily-snapshot",
    {},
    {
      repeat: { pattern: "0 2 * * *" },
      jobId: "trust-score-cron",
    }
  );
}
