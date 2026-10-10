import { describe, it, expect } from "vitest";
import { parseRange, isValidTz, windowFor } from "./dashboard-range.js";

describe("parseRange", () => {
  it("defaults and validates", () => {
    expect(parseRange(undefined)).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("bogus")).toBeNull();
  });
});
describe("isValidTz", () => {
  it("accepts IANA and rejects junk", () => {
    expect(isValidTz("Asia/Kolkata")).toBe(true);
    expect(isValidTz("Not/AZone")).toBe(false);
    expect(isValidTz("")).toBe(false);
  });
});
describe("windowFor", () => {
  it("today starts at local midnight in Asia/Kolkata (UTC+5:30)", () => {
    const now = new Date("2026-10-10T20:00:00Z"); // 2026-10-11 01:30 IST
    const w = windowFor("today", "Asia/Kolkata", now);
    expect(w.start.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    expect(w.end).toEqual(now);
    expect(w.prevEnd).toEqual(w.start);
    expect(w.end.getTime() - w.start.getTime()).toBe(w.prevEnd.getTime() - w.prevStart.getTime());
  });
  it("today handles a DST change day in America/New_York", () => {
    const now = new Date("2026-11-01T18:00:00Z"); // fall back day, 13:00 EST
    const w = windowFor("today", "America/New_York", now);
    expect(w.start.toISOString()).toBe("2026-11-01T04:00:00.000Z"); // midnight EDT (UTC-4)
  });
  it("7d is now minus 7x24h with an equal previous window", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const w = windowFor("7d", "UTC", now);
    expect(w.start.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(w.prevStart.toISOString()).toBe("2026-09-26T00:00:00.000Z");
  });
});
