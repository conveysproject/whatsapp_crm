import { isBillingV2Enabled } from "./flags.js";

export type EntitlementMode = "off" | "shadow" | "enforce";

export function resolveEntitlementMode(org: { createdAt: Date } | null, env: NodeJS.ProcessEnv = process.env): EntitlementMode {
  if (!org || !isBillingV2Enabled(env)) return "off";
  if (env["BILLING_ENTITLEMENTS_ENFORCE"] !== "true") return "shadow";
  // Enforcement requires a valid cutover date; missing or invalid fails safe to shadow.
  const cutoverRaw = env["BILLING_ENTITLEMENTS_ENFORCE_AFTER"]?.trim();
  if (!cutoverRaw) return "shadow";
  const cutover = new Date(cutoverRaw);
  if (Number.isNaN(cutover.getTime())) return "shadow";
  if (org.createdAt.getTime() < cutover.getTime()) return "shadow";
  return "enforce";
}
