import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env["STRIPE_SECRET_KEY"]) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(process.env["STRIPE_SECRET_KEY"], { apiVersion: "2025-04-30.basil" });
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
