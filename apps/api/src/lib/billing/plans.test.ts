import { describe, it, expect } from "vitest";
import { TIER_DEFINITIONS, isKnownTier, tierLimit, tierFeature } from "./plans.js";
import { PLAN_LIMITS } from "../stripe.js";

describe("tier table", () => {
  it("contacts limits match the advertised PLAN_LIMITS (starter/growth/scale)", () => {
    for (const t of ["starter", "growth", "scale"] as const) {
      expect(tierLimit(t, "contacts")).toBe(PLAN_LIMITS[t]!.contacts);
    }
  });
  it("enterprise is unlimited with every feature on", () => {
    for (const e of ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const) {
      expect(tierLimit("enterprise", e)).toBeNull();
    }
    expect(tierFeature("enterprise", "ai_chat_bot")).toBe(true);
    expect(tierFeature("enterprise", "api_access")).toBe(true);
  });
  it("limits never decrease as the tier goes up (null = unlimited counts as highest)", () => {
    const order = ["starter", "growth", "scale", "enterprise"] as const;
    const rank = (v: number | null | undefined) => (v === null ? Infinity : (v as number));
    for (const e of Object.keys(TIER_DEFINITIONS.starter.limits) as (keyof typeof TIER_DEFINITIONS.starter.limits)[]) {
      for (let i = 1; i < order.length; i++) {
        expect(rank(tierLimit(order[i]!, e))).toBeGreaterThanOrEqual(rank(tierLimit(order[i - 1]!, e)));
      }
    }
  });
  it("features never turn off as the tier goes up", () => {
    const order = ["starter", "growth", "scale", "enterprise"] as const;
    for (const f of ["ai_chat_bot", "api_access"] as const) {
      for (let i = 1; i < order.length; i++) {
        expect(Number(tierFeature(order[i]!, f))).toBeGreaterThanOrEqual(Number(tierFeature(order[i - 1]!, f)));
      }
    }
  });
  it("returns undefined for unknown tiers and rejects prototype keys", () => {
    expect(tierLimit("nope", "contacts")).toBeUndefined();
    expect(tierFeature("nope", "api_access")).toBeUndefined();
    expect(isKnownTier("__proto__")).toBe(false);
    expect(isKnownTier("growth")).toBe(true);
  });
});
