import { describe, it, expect } from "vitest";
import { normalizeMessageUsage, sourceRows, monthLabel, formatCount, barHeights } from "./message-usage";

describe("normalizeMessageUsage", () => {
  it("maps a full body", () => {
    const u = normalizeMessageUsage({
      month: "2026-10", billable: 9, bySource: { campaign: 4, api: 3, unknown: 2 },
      daily: [{ day: "2026-10-01", billable: 5 }, { day: "2026-10-02", billable: 4 }], updatedAt: "2026-10-10T11:05:00.000Z",
    });
    expect(u).toEqual({
      month: "2026-10", billable: 9, bySource: { campaign: 4, api: 3, unknown: 2 },
      daily: [{ day: "2026-10-01", billable: 5 }, { day: "2026-10-02", billable: 4 }], updatedAt: "2026-10-10T11:05:00.000Z",
    });
  });
  it("never throws and degrades to safe defaults", () => {
    expect(normalizeMessageUsage(null)).toBeNull();
    expect(normalizeMessageUsage("x")).toBeNull();
    expect(normalizeMessageUsage([])).toBeNull();
    expect(normalizeMessageUsage({})).toEqual({ month: "", billable: 0, bySource: {}, daily: [], updatedAt: null });
    expect(normalizeMessageUsage({ billable: -5, bySource: { a: "x", b: -1, c: 2 }, daily: [1, null, { day: 5 }, { day: "d", billable: "z" }] }))
      .toEqual({ month: "", billable: 0, bySource: { c: 2 }, daily: [{ day: "d", billable: 0 }], updatedAt: null });
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
