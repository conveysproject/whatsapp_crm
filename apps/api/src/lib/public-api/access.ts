import type { PrismaClient } from "@prisma/client";

/** Most active (non-revoked) API credentials one organization may hold. */
export const MAX_ACTIVE_CREDENTIALS = 10;

/** Vendor-setting key (platform-controlled prefix, so tenants cannot write it) that blocks one org from the public API. */
const BLOCK_KEY = "plan_feature_public_api_blocked";

export type PublicApiAccess = { allowed: true } | { allowed: false; reason: "not_allowed" | "blocked" };

/** Comma-separated org ids from PUBLIC_API_ALLOWED_ORGS, trimmed, empties dropped. Read on every call. */
function allowedOrgs(): string[] {
  return (process.env["PUBLIC_API_ALLOWED_ORGS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Whether an organization may use the public WhatsApp API (and manage its credentials).
 * 1. Rollout allow-list: a non-empty PUBLIC_API_ALLOWED_ORGS restricts access to the listed orgs; unset/empty = everyone.
 * 2. Per-org kill switch: vendor setting `plan_feature_public_api_blocked` = "1" | "true" blocks the org.
 * Callers must return the same response for both reasons so the reason is not an oracle.
 */
export async function checkPublicApiAccess(prisma: PrismaClient, organizationId: string): Promise<PublicApiAccess> {
  const list = allowedOrgs();
  if (list.length > 0 && !list.includes(organizationId)) return { allowed: false, reason: "not_allowed" };
  const row = await prisma.vendorSetting.findFirst({ where: { organizationId, key: BLOCK_KEY }, select: { value: true } });
  const v = row?.value?.trim().toLowerCase();
  if (v === "1" || v === "true") return { allowed: false, reason: "blocked" };
  return { allowed: true };
}
