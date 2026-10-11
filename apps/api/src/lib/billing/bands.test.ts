import { describe, it, expect } from "vitest";
import { DEFAULT_BILLING_CONFIG, parseBillingConfig, planFor, bandViews, projectMonthTotal, type BillingConfig, type PlanView } from "./bands.js";

const published: BillingConfig = { ...DEFAULT_BILLING_CONFIG, published: true };

describe("planFor", () => {
  it("reveals nothing but the free allowance while unpublished", () => {
    expect(planFor(5000, DEFAULT_BILLING_CONFIG)).toEqual({ published: false, freeAllowance: 500 });
  });
  it("puts counts at the boundaries in the right band", () => {
    const at = (n: number) => (planFor(n, published) as PlanView).current.name;
    expect(at(0)).toBe("Free");
    expect(at(500)).toBe("Free");
    expect(at(501)).toBe("Band 1");
    expect(at(10_000)).toBe("Band 1");
    expect(at(10_001)).toBe("Band 2");
    expect(at(50_001)).toBe("Band 3 (cap)");
    expect(at(250_000)).toBe("Band 3 (cap)");
    expect(at(250_001)).toBe("Above");
  });
  it("reports the distance to the next band and the cap", () => {
    const p = planFor(3240, published) as PlanView;
    expect(p.position).toBe("band");
    expect(p.current.inr).toBe(999);
    expect(p.remainingToNextBand).toBe(6761);
    expect(p.next?.name).toBe("Band 2");
    expect(p.cap).toEqual({ upTo: 250_000, inr: 7999, usd: 96 });
  });
  it("has no next band in the top band or above it", () => {
    const top = planFor(100_000, published) as PlanView;
    expect(top.next).toBeNull();
    expect(top.remainingToNextBand).toBeNull();
    const above = planFor(300_000, published) as PlanView;
    expect(above.position).toBe("above");
    expect(above.next).toBeNull();
    expect(above.current.inr).toBeNull();
  });
  it("builds the table with Free first and Above last", () => {
    const v = bandViews(published);
    expect(v.map((b) => b.name)).toEqual(["Free", "Band 1", "Band 2", "Band 3 (cap)", "Above"]);
    expect(v[1]).toMatchObject({ from: 501, to: 10_000 });
  });
});

describe("parseBillingConfig", () => {
  const good = { published: false, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, bands: [{ upTo: 1000, inr: 10, usd: 1 }, { upTo: 5000, inr: 20, usd: 2 }] };
  it("accepts a valid config", () => {
    expect(parseBillingConfig(good)).toEqual({ ok: true, config: good });
  });
  it("accepts a real charging start date", () => {
    const r = parseBillingConfig({ ...good, chargingStartDate: "2026-11-01" });
    expect(r.ok && r.config.chargingStartDate).toBe("2026-11-01");
  });
  it("rejects bad shapes and values", () => {
    const bad: unknown[] = [
      null, [], { ...good, published: "yes" }, { ...good, freeAllowance: -1 }, { ...good, freeAllowance: 1.5 }, { ...good, bands: [] },
      { ...good, bands: [{ upTo: 400, inr: 1, usd: 1 }] },
      { ...good, bands: [{ upTo: 1000, inr: 10, usd: 1 }, { upTo: 1000, inr: 20, usd: 2 }] },
      { ...good, bands: [{ upTo: 1000, inr: 10, usd: 1 }, { upTo: 2000, inr: 5, usd: 2 }] },
      { ...good, bands: [{ upTo: 1000, inr: "10", usd: 1 }] },
      { ...good, bands: [{ upTo: 1000, inr: -1, usd: 1 }] },
      { ...good, alertsEnabled: "yes" },
      { ...good, chargingStartDate: "2026-02-30" },
      { ...good, chargingStartDate: "soon" },
      { ...good, chargingStartDate: 20261101 },
    ];
    for (const b of bad) expect(parseBillingConfig(b).ok, JSON.stringify(b)).toBe(false);
  });
});

describe("projectMonthTotal", () => {
  it("projects from pace and refuses too-early guesses", () => {
    expect(projectMonthTotal(3000, 10, 31)).toBe(9300);
    expect(projectMonthTotal(100, 2, 31)).toBeNull();
  });
});
