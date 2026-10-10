export type LimitEntity = "contacts" | "campaigns" | "chatbots" | "flows" | "custom_fields" | "team_members";
export type FeatureKey = "ai_chat_bot" | "api_access";

export interface TierDefinition {
  limits: Record<LimitEntity, number | null>; // null = unlimited
  features: Record<FeatureKey, boolean>;
}

// Owner-approved PLACEHOLDER values (docs/prd-billing-phase1.md section 8). Edit here only.
export const TIER_DEFINITIONS = {
  starter: {
    limits: { contacts: 500, campaigns: 5, chatbots: 1, flows: 3, custom_fields: 5, team_members: 2 },
    features: { ai_chat_bot: false, api_access: false },
  },
  growth: {
    limits: { contacts: 5000, campaigns: 50, chatbots: 5, flows: 20, custom_fields: 25, team_members: 5 },
    features: { ai_chat_bot: true, api_access: true },
  },
  scale: {
    limits: { contacts: 50000, campaigns: null, chatbots: null, flows: null, custom_fields: null, team_members: 20 },
    features: { ai_chat_bot: true, api_access: true },
  },
  enterprise: {
    limits: { contacts: null, campaigns: null, chatbots: null, flows: null, custom_fields: null, team_members: null },
    features: { ai_chat_bot: true, api_access: true },
  },
} as const satisfies Record<string, TierDefinition>;

export function isKnownTier(v: unknown): v is keyof typeof TIER_DEFINITIONS {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TIER_DEFINITIONS, v);
}

export function tierLimit(tier: string, entity: LimitEntity): number | null | undefined {
  return isKnownTier(tier) ? TIER_DEFINITIONS[tier].limits[entity] : undefined;
}

export function tierFeature(tier: string, feature: FeatureKey): boolean | undefined {
  return isKnownTier(tier) ? TIER_DEFINITIONS[tier].features[feature] : undefined;
}
