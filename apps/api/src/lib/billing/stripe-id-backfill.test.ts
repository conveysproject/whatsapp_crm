import { describe, it, expect } from "vitest";
import { planStripeIdBackfill, parseBackfillArgs } from "./stripe-id-backfill.js";

const org = (id: string, stripeId: string | null, settings: unknown) => ({ id, stripeId, settings });

describe("planStripeIdBackfill", () => {
  it("returns empty plan for empty input", () => {
    expect(planStripeIdBackfill([])).toEqual({ updates: [], conflicts: [] });
  });
  it("plans an eligible org", () => {
    expect(planStripeIdBackfill([org("o1", null, { stripeCustomerId: "cus_1" })])).toEqual({
      updates: [{ id: "o1", stripeId: "cus_1" }],
      conflicts: [],
    });
  });
  it("skips orgs that already have a stripeId", () => {
    const r = planStripeIdBackfill([org("o1", "cus_9", { stripeCustomerId: "cus_1" })]);
    expect(r).toEqual({ updates: [], conflicts: [] });
  });
  it("skips junk settings", () => {
    const junk: unknown[] = [null, undefined, 5, "cus_1", [], ["cus_1"], {}, { stripeCustomerId: 5 }, { stripeCustomerId: null }, { stripeCustomerId: "" }, { stripeCustomerId: "   " }, { stripeCustomerId: ["cus_1"] }];
    const r = planStripeIdBackfill(junk.map((s, i) => org(`o${i}`, null, s)));
    expect(r).toEqual({ updates: [], conflicts: [] });
  });
  it("trims whitespace around the customer id", () => {
    expect(planStripeIdBackfill([org("o1", null, { stripeCustomerId: "  cus_1 " })]).updates).toEqual([{ id: "o1", stripeId: "cus_1" }]);
  });
  it("reports duplicates across two orgs as a conflict and updates neither", () => {
    const r = planStripeIdBackfill([
      org("o1", null, { stripeCustomerId: "cus_1" }),
      org("o2", null, { stripeCustomerId: " cus_1" }),
      org("o3", null, { stripeCustomerId: "cus_3" }),
    ]);
    expect(r.updates).toEqual([{ id: "o3", stripeId: "cus_3" }]);
    expect(r.conflicts).toEqual([{ stripeId: "cus_1", orgIds: ["o1", "o2"] }]);
  });
  it("reports a customer id already held by another org's stripeId as a conflict", () => {
    const r = planStripeIdBackfill([org("o1", null, { stripeCustomerId: "cus_1" }), org("o2", "cus_1", {})]);
    expect(r.updates).toEqual([]);
    expect(r.conflicts).toEqual([{ stripeId: "cus_1", orgIds: ["o1", "o2"] }]);
  });
});

describe("parseBackfillArgs", () => {
  it("defaults to dry run", () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false });
  });
  it("accepts exact --apply", () => {
    expect(parseBackfillArgs(["--apply"])).toEqual({ apply: true });
  });
  it("rejects unknown flags and near-misses", () => {
    expect(() => parseBackfillArgs(["--aply"])).toThrow(/Usage/);
    expect(() => parseBackfillArgs(["--apply=true"])).toThrow(/Usage/);
    expect(() => parseBackfillArgs(["--apply", "--force"])).toThrow(/Usage/);
    expect(() => parseBackfillArgs(["apply"])).toThrow(/Usage/);
  });
});
