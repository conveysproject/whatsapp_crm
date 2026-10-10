import type { PrismaClient, PlanTier, PaymentGateway } from "@prisma/client";

export type ActivationSource = "stripe" | "razorpay" | "paystack" | "yoomoney" | "manual_approval" | "admin";

export interface ActivatePlanInput {
  organizationId: string;
  planTier: PlanTier;
  source: ActivationSource;
  gateway: PaymentGateway;
  referenceId: string;
  gatewayTransactionId?: string;
  amountMinor?: number;
  currency?: string;
  stripeSubscriptionId?: string;
  manualSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
  /** Record the Transaction only: no manual-subscription writes and no organization update. */
  ledgerOnly?: boolean;
}

export interface ActivationResult { duplicate: boolean }

function prismaCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

/** True when the organization does not exist (foreign key on the Transaction insert, or update of a missing row). */
export function isUnknownOrgError(err: unknown): boolean {
  const c = prismaCode(err);
  return c === "P2003" || c === "P2025";
}

/**
 * The only function allowed to change Organization.planTier for a payment. The Transaction row is inserted
 * FIRST: its unique keys (referenceId, gatewayTransactionId) make a replayed event a no-op, and a unique
 * violation aborts the DB transaction before anything else is written.
 */
export async function activatePlan(prisma: PrismaClient, input: ActivatePlanInput): Promise<ActivationResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          organizationId: input.organizationId,
          amount: input.amountMinor ?? 0,
          currency: (input.currency ?? "INR").toUpperCase(),
          type: "subscription",
          status: "completed",
          gateway: input.gateway,
          gatewayTransactionId: input.gatewayTransactionId ?? null,
          referenceId: input.referenceId,
          manualSubscriptionId: input.manualSubscriptionId ?? null,
          stripeSubscriptionId: input.stripeSubscriptionId ?? null,
          metadata: { source: input.source, planTier: input.planTier },
        },
      });
      if (input.ledgerOnly) return;
      if (input.manualSubscriptionId) {
        await tx.manualSubscription.updateMany({
          where: { organizationId: input.organizationId, status: "active", id: { not: input.manualSubscriptionId } },
          data: { status: "cancelled" },
        });
        await tx.manualSubscription.update({ where: { id: input.manualSubscriptionId }, data: { status: "active" } });
      }
      await tx.organization.update({
        where: { id: input.organizationId },
        data: {
          planTier: input.planTier,
          billingStatus: "active",
          billingGraceEndsAt: null,
          planCancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        },
      });
    });
    return { duplicate: false };
  } catch (err) {
    if (prismaCode(err) === "P2002") return { duplicate: true };
    throw err;
  }
}
