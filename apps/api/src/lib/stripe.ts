import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env["STRIPE_SECRET_KEY"]) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(process.env["STRIPE_SECRET_KEY"], { apiVersion: "2026-04-22.dahlia" });
  }
  return _stripe;
}

export const PLAN_PRICE_IDS: Record<string, string> = {
  starter: process.env["STRIPE_PRICE_STARTER"] ?? "",
  growth: process.env["STRIPE_PRICE_GROWTH"] ?? "",
  scale: process.env["STRIPE_PRICE_SCALE"] ?? "",
  enterprise: process.env["STRIPE_PRICE_ENTERPRISE"] ?? "",
};

export const PLAN_LIMITS: Record<string, { contacts: number; messages: number }> = {
  starter: { contacts: 500, messages: 1000 },
  growth: { contacts: 5000, messages: 20000 },
  scale: { contacts: 50000, messages: 200000 },
  enterprise: { contacts: Infinity, messages: Infinity },
};

// GAP-S73: Currencies that use whole units — do NOT multiply by 100 for Stripe
export const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF", "HUF",
]);

export function toStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}
