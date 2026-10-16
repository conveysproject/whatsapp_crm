import { describe, it, expect } from "vitest";
import { normalizePublicPricing, pricingCards, freeAllowanceLabel } from "./public-pricing";

const LIVE = {
  published: true,
  freeAllowance: 500,
  bands: [
    { name: "Free", from: 0, to: 500, inr: 0, usd: 0 },
    { name: "Band 1", from: 501, to: 10000, inr: 500, usd: 5 },
    { name: "Band 2", from: 10001, to: 50000, inr: 700, usd: 7 },
    { name: "Band 3 (cap)", from: 50001, to: null, inr: 1200, usd: 12 },
  ],
};

describe("normalizePublicPricing", () => {
  it("keeps a published band table", () => {
    const p = normalizePublicPricing(LIVE);
    expect(p).toEqual(LIVE);
  });

  it("keeps only the free allowance while prices are unpublished", () => {
    expect(normalizePublicPricing({ published: false, freeAllowance: 500 })).toEqual({ published: false, freeAllowance: 500 });
  });

  it("treats a published body with no usable bands as unpublished", () => {
    expect(normalizePublicPricing({ published: true, freeAllowance: 500, bands: [{ nope: 1 }] })).toEqual({ published: false, freeAllowance: 500 });
  });

  it("returns null for anything that is not a pricing body", () => {
    for (const raw of [null, undefined, "x", 42, {}, { published: "yes" }]) expect(normalizePublicPricing(raw)).toBeNull();
  });
});

describe("pricingCards", () => {
  it("builds one card per band in INR, with the top band marked as the cap", () => {
    const p = normalizePublicPricing(LIVE)!;
    expect(pricingCards(p, "inr")).toEqual([
      { key: "Free", range: "Up to 500 messages", price: "₹0", note: "every month", isCap: false },
      { key: "Band 1", range: "501 to 10,000 messages", price: "₹500", note: "per month", isCap: false },
      { key: "Band 2", range: "10,001 to 50,000 messages", price: "₹700", note: "per month", isCap: false },
      { key: "Band 3 (cap)", range: "50,001 messages and above", price: "₹1,200", note: "max per month, never more", isCap: true },
    ]);
  });

  it("formats USD prices", () => {
    const prices = pricingCards(normalizePublicPricing(LIVE)!, "usd").map((c) => c.price);
    expect(prices).toEqual(["$0", "$5", "$7", "$12"]);
  });

  it("returns no cards while prices are unpublished", () => {
    expect(pricingCards({ published: false, freeAllowance: 500 }, "inr")).toEqual([]);
  });
});

describe("freeAllowanceLabel", () => {
  it("states the monthly free allowance", () => {
    expect(freeAllowanceLabel(500)).toBe("500 messages free every month");
    expect(freeAllowanceLabel(1000)).toBe("1,000 messages free every month");
  });
});
