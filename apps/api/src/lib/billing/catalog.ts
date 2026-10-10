export const PLAN_CATALOG = {
  starter: { name: "Starter", priceInr: 999, priceUsd: 12 },
  growth: { name: "Growth", priceInr: 2999, priceUsd: 36 },
  scale: { name: "Scale", priceInr: 7999, priceUsd: 96 },
} as const;

export type BillableTier = keyof typeof PLAN_CATALOG;

export function isBillableTier(v: unknown): v is BillableTier {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLAN_CATALOG, v);
}

/** True only when the paid amount (minor units) covers at least the monthly list price in a catalogued currency. */
export function isPaidAmountSufficient(tier: unknown, currency: string, paidMinorUnits: number): boolean {
  if (!isBillableTier(tier) || !Number.isFinite(paidMinorUnits)) return false;
  const cur = currency.toUpperCase();
  const plan = PLAN_CATALOG[tier];
  if (cur === "INR") return paidMinorUnits >= plan.priceInr * 100;
  if (cur === "USD") return paidMinorUnits >= plan.priceUsd * 100;
  return false;
}
