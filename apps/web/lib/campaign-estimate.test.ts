import { describe, it, expect } from "vitest";
import { buildEstimate } from "./campaign-estimate";
import { normalizeMessageUsage, normalizePlan, type MessageUsage } from "./message-usage";

const published = normalizePlan({
  published: true, freeAllowance: 500, position: "band", remainingToNextBand: 100, next: null,
  current: { name: "Band 1", from: 501, to: 10000, inr: 500, usd: 5 }, cap: { upTo: 10000, inr: 700, usd: 7 },
  bands: [
    { name: "Free", from: 0, to: 500, inr: 0, usd: 0 },
    { name: "Band 1", from: 501, to: 10000, inr: 500, usd: 5 },
    { name: "Band 2 (cap)", from: 10001, to: null, inr: 700, usd: 7 },
  ],
})!;

function usage(billable: number, plan: MessageUsage["plan"]): MessageUsage {
  return { ...normalizeMessageUsage({})!, billable, plan };
}

describe("buildEstimate", () => {
  it("returns nothing when there is no plan", () => {
    expect(buildEstimate(usage(10, null), 5)).toBeNull();
  });
  it("says the audience is unknown when there is no recipient count", () => {
    for (const r of [null, 0, -3]) {
      const e = buildEstimate(usage(3240, published), r);
      expect(e?.tone).toBe("plain");
      expect(e?.rows).toEqual([["Used so far this period", "3,240"]]);
    }
  });
  it("stays in the same band", () => {
    const e = buildEstimate(usage(3240, published), 3200)!;
    expect(e.rows).toEqual([["Messages this can count", "up to 3,200"], ["Used so far this period", "3,240"], ["After sending", "up to 6,440"]]);
    expect(e.tone).toBe("green");
    expect(e.footer).toContain("You stay in Band 1");
  });
  it("warns when the campaign could move to a higher band and shows the cap", () => {
    const e = buildEstimate(usage(9000, published), 3000)!;
    expect(e.tone).toBe("amber");
    expect(e.footer).toContain("Band 2 (cap)");
    expect(e.footer).toContain("never more than ₹700");
  });
  it("talks only about the free allowance while prices are unpublished", () => {
    const hidden = { published: false as const, freeAllowance: 500 };
    expect(buildEstimate(usage(100, hidden), 200)?.footer).toBe("You stay within your free messages.");
    expect(buildEstimate(usage(400, hidden), 200)?.footer).toContain("past your 500 free messages");
  });
});
