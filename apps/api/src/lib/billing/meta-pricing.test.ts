import { describe, it, expect } from "vitest";
import { extractMetaPricing, isMetaBillable } from "./meta-pricing.js";

describe("extractMetaPricing", () => {
  it("reads Meta's type and category", () => {
    expect(extractMetaPricing({ billable: true, pricing_model: "PMP", type: "regular", category: "marketing" })).toEqual({ type: "regular", category: "marketing" });
    expect(extractMetaPricing({ billable: false, pricing_model: "PMP", type: "free_customer_service", category: "service" })).toEqual({ type: "free_customer_service", category: "service" });
    expect(extractMetaPricing({ type: "free_entry_point", category: "utility" })).toEqual({ type: "free_entry_point", category: "utility" });
  });

  it("normalises case and whitespace", () => {
    expect(extractMetaPricing({ type: " Regular ", category: "Utility" })).toEqual({ type: "regular", category: "utility" });
  });

  it("falls back to the billable flag when type is missing", () => {
    expect(extractMetaPricing({ billable: true, category: "marketing" })).toEqual({ type: "regular", category: "marketing" });
    expect(extractMetaPricing({ billable: false })).toEqual({ type: "free", category: null });
  });

  it("trusts type over a conflicting billable flag", () => {
    expect(extractMetaPricing({ billable: true, type: "free_customer_service" })).toEqual({ type: "free_customer_service", category: null });
  });

  it("keeps a future type value as-is (counted only if it is exactly regular) and nulls a malformed category", () => {
    expect(extractMetaPricing({ type: "some_new_type", category: "weird category!" })).toEqual({ type: "some_new_type", category: null });
  });

  it("returns null when there is no usable pricing data", () => {
    for (const bad of [undefined, null, "x", 5, [], {}, { category: "marketing" }, { type: 5 }, { type: "bad type!" }, { type: "" }]) {
      expect(extractMetaPricing(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("isMetaBillable", () => {
  it("is true only for the exact type regular", () => {
    expect(isMetaBillable("regular")).toBe(true);
    for (const t of ["free_customer_service", "free_entry_point", "free", "", null, undefined, "Regular"]) {
      expect(isMetaBillable(t as string | null | undefined)).toBe(false);
    }
  });
});
