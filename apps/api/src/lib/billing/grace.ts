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
    try {
      // The Stripe subscription is intentionally NOT cancelled here: Stripe's own retry/cancel policy
      // emits customer.subscription.deleted. billingGraceEndsAt is re-checked so an org whose grace
      // was refreshed since the select is not downgraded.
      const res = await prisma.organization.updateMany({
        where: { id, billingStatus: "past_due", billingGraceEndsAt: { lt: now } },
        data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false },
      });
      if (res.count > 0) downgraded.push(id);
    } catch (err) {
      console.error("[billing] grace expiry failed", { organizationId: id, error: err instanceof Error ? err.name : "error" });
    }
  }
  return downgraded;
}
