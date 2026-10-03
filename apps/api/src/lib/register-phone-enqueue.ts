import type { PrismaClient } from "@prisma/client";
import { RESET_KEYS } from "./auto-register-phone.js";

/**
 * Entry points used by routes and the Meta sync. They import the worker module lazily and return at
 * once while AUTO_REGISTER_PHONE_ENABLED is off, so routes (and their tests) never open a Redis
 * connection or touch the queue unless the feature is on.
 */
export const autoRegisterEnabled = (): boolean => process.env["AUTO_REGISTER_PHONE_ENABLED"] === "true";

/** After a (re)connect: clear retry state so the org is checked again, then schedule the first check. */
export async function onWhatsappConnected(prisma: PrismaClient, organizationId: string): Promise<void> {
  if (!autoRegisterEnabled()) return;
  try {
    await prisma.vendorSetting.deleteMany({ where: { organizationId, key: { in: [...RESET_KEYS] } } });
    const { enqueueRegisterCheck } = await import("../workers/register-phone.worker.js");
    await enqueueRegisterCheck(organizationId);
  } catch (err) {
    console.warn("[register-phone] enqueue after connect failed (non-fatal)", err);
  }
}

/** After a Sync stored phone status PENDING: make sure the org gets a check. */
export async function onPhoneStatusPending(organizationId: string): Promise<void> {
  if (!autoRegisterEnabled()) return;
  try {
    const { enqueueRegisterCheck } = await import("../workers/register-phone.worker.js");
    await enqueueRegisterCheck(organizationId);
  } catch (err) {
    console.warn("[register-phone] enqueue after sync failed (non-fatal)", err);
  }
}
