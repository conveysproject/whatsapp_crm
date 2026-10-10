import { PLAN_PRICE_IDS } from "../stripe.js";
import { isBillableTier, type BillableTier } from "./catalog.js";

export function getStripeCustomerId(org: { stripeId: string | null; settings: unknown } | null): string | null {
  if (!org) return null;
  if (org.stripeId) return org.stripeId;
  const s = org.settings as Record<string, unknown> | null;
  const v = s?.["stripeCustomerId"];
  return typeof v === "string" && v ? v : null;
}

export function tierFromPriceId(priceId: string | undefined, priceIds: Record<string, string> = PLAN_PRICE_IDS): BillableTier | null {
  if (!priceId) return null;
  for (const [tier, id] of Object.entries(priceIds)) {
    if (id && id === priceId && isBillableTier(tier)) return tier;
  }
  return null;
}
