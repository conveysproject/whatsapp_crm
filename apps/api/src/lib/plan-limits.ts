import type { PrismaClient } from "@prisma/client";
import { isBillingV2Enabled } from "./billing/flags.js";
import { shouldLogShadow } from "./billing/shadow-log.js";
import { resolveEntitlementMode } from "./billing/entitlement-mode.js";
import { tierFeature, tierLimit, type FeatureKey, type LimitEntity } from "./billing/plans.js";

const SETTING_KEY: Record<LimitEntity, string> = {
  contacts: "plan_limit_contacts",
  campaigns: "plan_limit_campaigns",
  chatbots: "plan_limit_chatbots",
  flows: "plan_limit_flows",
  custom_fields: "plan_limit_custom_fields",
  team_members: "plan_limit_team_members",
};

async function countEntity(prisma: PrismaClient, entity: LimitEntity, organizationId: string): Promise<number> {
  switch (entity) {
    case "contacts":
      return prisma.contact.count({ where: { organizationId, deletedAt: null } });
    case "campaigns":
      return prisma.campaign.count({ where: { organizationId } });
    case "chatbots":
      // GAP-S69: WhatsJet only counts standalone bots (bot_flows__id IS NULL). TrustCRM's
      // Chatbot model always requires a flowId, so all bots are "flow-attached" and the plan
      // limit counts all chatbots equally. If a standalone-bot concept is added later, filter
      // by flowId IS NULL here.
      return prisma.chatbot.count({ where: { organizationId } });
    case "flows":
      return prisma.flow.count({ where: { organizationId } });
    case "custom_fields":
      return prisma.contactCustomField.count({ where: { organizationId, isActive: true } });
    case "team_members":
      return prisma.user.count({ where: { organizationId, isActive: true } });
  }
}

// Loads the org for tier-derived entitlements. Any error falls back to legacy behaviour (null).
async function loadOrgForEntitlements(prisma: PrismaClient, organizationId: string) {
  try {
    return await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true, createdAt: true },
    });
  } catch {
    return null;
  }
}

// Binary feature switch: enabled when plan_feature_{feature} = "1" or "true".
// A VendorSetting row is a platform override and always wins; without a row the tier decides (enforce mode only).
export async function isFeatureEnabled(
  prisma: PrismaClient,
  organizationId: string,
  feature: FeatureKey
): Promise<boolean> {
  const setting = await prisma.vendorSetting.findFirst({
    where: { organizationId, key: `plan_feature_${feature}` },
    select: { value: true },
  });
  const today = setting?.value === "1" || setting?.value === "true";
  if (setting !== null && setting !== undefined) return today;
  if (!isBillingV2Enabled()) return today;

  const org = await loadOrgForEntitlements(prisma, organizationId);
  if (!org) return today;
  const mode = resolveEntitlementMode(org);
  if (mode === "off") return today;
  const tierOn = tierFeature(org.planTier, feature) ?? false;
  if (mode === "shadow") {
    if (tierOn && shouldLogShadow(`shadow_enable:${organizationId}:${feature}`)) console.warn("[entitlements] shadow_enable", { organizationId, feature });
    return today;
  }
  return tierOn;
}

// Returns allowed:true when under limit, or allowed:false when at/over limit.
// limit=-1 means unlimited (always allowed).
export async function checkPlanLimit(
  prisma: PrismaClient,
  organizationId: string,
  entity: LimitEntity
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const setting = await prisma.vendorSetting.findFirst({
    where: { organizationId, key: SETTING_KEY[entity] },
    select: { value: true },
  });

  const limit = parseInt(setting?.value ?? "-1", 10);
  const current = await countEntity(prisma, entity, organizationId);
  const today = (): { allowed: boolean; limit: number; current: number } =>
    isNaN(limit) || limit < 0 ? { allowed: true, limit: -1, current } : { allowed: current < limit, limit, current };

  // Any VendorSetting row is a platform override and always wins; flag off adds no queries.
  if ((setting !== null && setting !== undefined) || !isBillingV2Enabled()) return today();

  const org = await loadOrgForEntitlements(prisma, organizationId);
  if (!org) return today();
  const mode = resolveEntitlementMode(org);
  if (mode === "off") return today();

  const tier = tierLimit(org.planTier, entity); // number | null | undefined
  if (mode === "shadow") {
    if (typeof tier === "number" && current >= tier && shouldLogShadow(`shadow_block:${organizationId}:${entity}`)) {
      console.warn("[entitlements] shadow_block", { organizationId, entity, current, limit: tier });
    }
    return today();
  }
  if (typeof tier !== "number") return { allowed: true, limit: -1, current };
  return { allowed: current < tier, limit: tier, current };
}
