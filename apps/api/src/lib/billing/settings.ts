import type { PrismaClient } from "@prisma/client";
import { DEFAULT_BILLING_CONFIG, parseBillingConfig, type BillingConfig } from "./bands.js";

const KEY = "config";

/** Stored config, or the unpublished draft when nothing valid is stored (so a bad row can never expose prices). */
export async function loadBillingConfig(prisma: PrismaClient): Promise<BillingConfig> {
  try {
    const row = await prisma.billingSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    if (!row) return DEFAULT_BILLING_CONFIG;
    const parsed = parseBillingConfig(row.value);
    return parsed.ok ? parsed.config : DEFAULT_BILLING_CONFIG;
  } catch {
    return DEFAULT_BILLING_CONFIG;
  }
}

export async function saveBillingConfig(prisma: PrismaClient, config: BillingConfig, userId: string): Promise<void> {
  await prisma.billingSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: config as never, updatedBy: userId },
    update: { value: config as never, updatedBy: userId, updatedAt: new Date() },
  });
}
