import type { PrismaClient } from "@prisma/client";

const BATCH = 500;

export async function expireGraceOrgs(prisma: PrismaClient, now: Date = new Date()): Promise<string[]> {
  const due = await prisma.organization.findMany({
    where: { billingStatus: "past_due", billingGraceEndsAt: { lt: now } },
    select: { id: true },
    take: BATCH,
  });
  const downgraded: string[] = [];
  for (const { id } of due) {
    const res = await prisma.organization.updateMany({
      where: { id, billingStatus: "past_due" },
      data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false },
    });
    if (res.count > 0) downgraded.push(id);
  }
  return downgraded;
}
