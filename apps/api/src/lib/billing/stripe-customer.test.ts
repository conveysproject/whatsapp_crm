import { describe, it, expect } from "vitest";
import { getStripeCustomerId, tierFromPriceId } from "./stripe-customer.js";

describe("getStripeCustomerId", () => {
  it("prefers the column, falls back to settings, else null", () => {
    expect(getStripeCustomerId({ stripeId: "cus_col", settings: { stripeCustomerId: "cus_set" } })).toBe("cus_col");
    expect(getStripeCustomerId({ stripeId: null, settings: { stripeCustomerId: "cus_set" } })).toBe("cus_set");
    expect(getStripeCustomerId({ stripeId: null, settings: {} })).toBeNull();
    expect(getStripeCustomerId({ stripeId: null, settings: null })).toBeNull();
    expect(getStripeCustomerId(null)).toBeNull();
  });
});

describe("tierFromPriceId", () => {
  const ids = { starter: "price_s", growth: "price_g", scale: "price_sc", enterprise: "price_e", empty: "" };
  it("maps known billable price ids", () => {
    expect(tierFromPriceId("price_g", ids)).toBe("growth");
  });
  it("returns null for unknown, empty, enterprise and missing ids", () => {
    expect(tierFromPriceId("price_x", ids)).toBeNull();
    expect(tierFromPriceId("", ids)).toBeNull();
    expect(tierFromPriceId(undefined, ids)).toBeNull();
    expect(tierFromPriceId("price_e", ids)).toBeNull();
  });
});
