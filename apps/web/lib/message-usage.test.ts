import { describe, it, expect } from "vitest";
import { normalizeMessageUsage, normalizePlan, alertText, bandAt, periodLabel, resetLabel, cycleStartLabel, statementStatusLabel, bandRange, formatInr, sourceRows, monthLabel, formatCount, barHeights } from "./message-usage";

describe("normalizeMessageUsage", () => {
  it("maps a full body", () => {
    const u = normalizeMessageUsage({
      month: "2026-10", billable: 9, bySource: { campaign: 4, api: 3, unknown: 2 },
      daily: [{ day: "2026-10-01", billable: 5 }, { day: "2026-10-02", billable: 4 }], updatedAt: "2026-10-10T11:05:00.000Z",
    });
    expect(u).toEqual({
      month: "2026-10", billable: 9, bySource: { campaign: 4, api: 3, unknown: 2 },
      daily: [{ day: "2026-10-01", billable: 5 }, { day: "2026-10-02", billable: 4 }], updatedAt: "2026-10-10T11:05:00.000Z",
      plan: null, expected: null, alerts: [], statements: [], cycle: null,
    });
  });
  it("never throws and degrades to safe defaults", () => {
    expect(normalizeMessageUsage(null)).toBeNull();
    expect(normalizeMessageUsage("x")).toBeNull();
    expect(normalizeMessageUsage([])).toBeNull();
    expect(normalizeMessageUsage({})).toEqual({ month: "", billable: 0, bySource: {}, daily: [], updatedAt: null, plan: null, expected: null, alerts: [], statements: [], cycle: null });
    expect(normalizeMessageUsage({ billable: -5, bySource: { a: "x", b: -1, c: 2 }, daily: [1, null, { day: 5 }, { day: "d", billable: "z" }] }))
      .toEqual({ month: "", billable: 0, bySource: { c: 2 }, daily: [{ day: "d", billable: 0 }], updatedAt: null, plan: null, expected: null, alerts: [], statements: [], cycle: null });
  });
});

describe("sourceRows", () => {
  it("labels, sorts largest first and drops zeros; unknown keys keep their key", () => {
    expect(sourceRows({ api: 3, campaign: 10, unknown: 2, zero: 0, brandnew: 3 })).toEqual([
      { key: "campaign", label: "Campaigns", count: 10 },
      { key: "api", label: "API", count: 3 },
      { key: "brandnew", label: "brandnew", count: 3 },
      { key: "unknown", label: "Other messages", count: 2 },
    ]);
  });
});

describe("monthLabel and formatCount", () => {
  it("is locale independent", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("")).toBe("");
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12.6)).toBe("13");
  });
});

describe("barHeights", () => {
  it("scales to the busiest day, keeps quiet days visible and empty days at zero", () => {
    expect(barHeights([{ day: "a", billable: 100 }, { day: "b", billable: 50 }, { day: "c", billable: 1 }, { day: "d", billable: 0 }])).toEqual([100, 50, 3, 0]);
    expect(barHeights([])).toEqual([]);
    expect(barHeights([{ day: "a", billable: 0 }])).toEqual([0]);
  });
});

describe("plan helpers", () => {
  it("keeps an unpublished plan to the free allowance only", () => {
    expect(normalizePlan({ published: false, freeAllowance: 500, bands: [{ name: "Band 1", from: 501, to: 10000, inr: 999, usd: 12 }] })).toEqual({ published: false, freeAllowance: 500 });
  });
  it("degrades a malformed published plan to unpublished", () => {
    expect(normalizePlan({ published: true, freeAllowance: 500 })).toEqual({ published: false, freeAllowance: 500 });
    expect(normalizePlan("x")).toBeNull();
  });
  it("formats prices and ranges", () => {
    expect(formatInr(999)).toBe("₹999");
    expect(formatInr(null)).toBe("Custom quote");
    expect(bandRange({ name: "Free", from: 0, to: 500, inr: 0, usd: 0 })).toBe("up to 500");
    expect(bandRange({ name: "Band 1", from: 501, to: 10000, inr: 999, usd: 12 })).toBe("501 to 10,000");
    expect(bandRange({ name: "Above", from: 250001, to: null, inr: null, usd: null })).toBe("over 250,000");
  });
});

describe("alerts", () => {
  it("keeps only well-formed alert kinds", () => {
    const u = normalizeMessageUsage({ alerts: [{ kind: "free_80", at: "t" }, { kind: "<b>x</b>", at: "t" }, { kind: "band_2", at: 5 }, null, { kind: "above", at: "t" }] });
    expect(u?.alerts).toEqual([{ kind: "free_80", at: "t" }, { kind: "above", at: "t" }]);
  });
  it("words free-allowance alerts and hides band alerts until prices are published", () => {
    const hidden = { published: false as const, freeAllowance: 500 };
    expect(alertText("free_80", hidden)).toBe("You have used 80% of your 500 free messages this month.");
    expect(alertText("free_100", hidden)).toBe("You have used all 500 free messages this month.");
    expect(alertText("band_1", hidden)).toBeNull();
    expect(alertText("nonsense", null)).toBeNull();
  });
});

describe("statements", () => {
  it("keeps well-formed statements only", () => {
    const u = normalizeMessageUsage({ statements: [
      { month: "2026-09-14", messages: 3000, bandName: "Band 1", amountInr: 999, amountUsd: 12 },
      { month: "bad", messages: 1, bandName: "x" },
      { month: "2026-08-14", messages: 9, bandName: "Above", amountInr: null, amountUsd: null },
    ] });
    expect(u?.statements.map((s) => s.month)).toEqual(["2026-09-14", "2026-08-14"]);
    expect(u?.statements[1]?.amountInr).toBeNull();
  });
});

describe("bandAt", () => {
  const plan = normalizePlan({
    published: true, freeAllowance: 500, position: "band", remainingToNextBand: 1, next: null,
    current: { name: "Band 1", from: 501, to: 10000, inr: 500, usd: 5 }, cap: { upTo: 10000, inr: 500, usd: 5 },
    bands: [
      { name: "Free", from: 0, to: 500, inr: 0, usd: 0 },
      { name: "Band 1", from: 501, to: 10000, inr: 500, usd: 5 },
      { name: "Above", from: 10001, to: null, inr: null, usd: null },
    ],
  })!;
  it("finds the band at the boundaries", () => {
    expect(bandAt(plan, 0)?.name).toBe("Free");
    expect(bandAt(plan, 500)?.name).toBe("Free");
    expect(bandAt(plan, 501)?.name).toBe("Band 1");
    expect(bandAt(plan, 10001)?.name).toBe("Above");
  });
  it("returns null while unpublished", () => {
    expect(bandAt({ published: false, freeAllowance: 500 }, 600)).toBeNull();
  });
});

describe("cycle labels", () => {
  const u = normalizeMessageUsage({ cycle: { key: "2026-10-14", from: "2026-10-14T00:00:00.000Z", toExclusive: "2026-11-14T00:00:00.000Z", days: 31 } });
  it("describes the cycle from its first to its last day", () => {
    expect(periodLabel(u!.cycle)).toBe("14 Oct to 13 Nov 2026");
    expect(resetLabel(u!.cycle)).toBe("14 Nov 2026");
    expect(cycleStartLabel("2026-10-14")).toBe("Cycle from 14 Oct 2026");
  });
  it("copes with a year boundary and missing or malformed cycles", () => {
    const y = normalizeMessageUsage({ cycle: { key: "2026-12-31", from: "2026-12-31T00:00:00.000Z", toExclusive: "2027-01-31T00:00:00.000Z", days: 31 } });
    expect(periodLabel(y!.cycle)).toBe("31 Dec to 30 Jan 2027");
    expect(periodLabel(null)).toBe("");
    expect(normalizeMessageUsage({ cycle: { key: "x", from: "y", toExclusive: "z" } })?.cycle).toBeNull();
  });
});

describe("statement status", () => {
  it("words each status for customers and defaults a missing one to due", () => {
    expect(statementStatusLabel("paid")).toBe("Paid");
    expect(statementStatusLabel("no_payment")).toBe("No payment needed");
    expect(statementStatusLabel("issued")).toBe("Due");
    const u = normalizeMessageUsage({ statements: [{ month: "2026-10-14", messages: 1, bandName: "Band 1", amountInr: 5, amountUsd: 1 }] });
    expect(u?.statements[0]?.status).toBe("issued");
  });
});
