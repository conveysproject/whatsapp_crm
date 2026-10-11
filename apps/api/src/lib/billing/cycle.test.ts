import { describe, it, expect } from "vitest";
import { cycleContaining, previousCycle, cycleEndingOn, parseCycleKey } from "./cycle.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("cycleContaining", () => {
  const created = new Date("2026-03-14T09:30:00Z");
  it("starts on the registration day and ends on the same day next month", () => {
    const c = cycleContaining(created, new Date("2026-10-20T12:00:00Z"));
    expect(c.key).toBe("2026-10-14");
    expect(c.endExclusive.toISOString()).toBe("2026-11-14T00:00:00.000Z");
    expect(c.days).toBe(31);
  });
  it("belongs to the previous month's cycle before the anchor day", () => {
    expect(cycleContaining(created, new Date("2026-10-13T23:59:59Z")).key).toBe("2026-09-14");
    expect(cycleContaining(created, new Date("2026-10-14T00:00:00Z")).key).toBe("2026-10-14");
  });
  it("crosses a year boundary", () => {
    const c = cycleContaining(created, new Date("2027-01-05T00:00:00Z"));
    expect(c.key).toBe("2026-12-14");
    expect(c.endExclusive.toISOString()).toBe("2027-01-14T00:00:00.000Z");
  });
  it("clamps an anchor of 31 to the last day of short months", () => {
    const c31 = new Date("2026-01-31T10:00:00Z");
    expect(cycleContaining(c31, new Date("2026-02-10T00:00:00Z")).key).toBe("2026-01-31");
    expect(cycleContaining(c31, new Date("2026-02-28T00:00:00Z")).key).toBe("2026-02-28");
    expect(cycleContaining(c31, new Date("2026-03-30T00:00:00Z")).key).toBe("2026-02-28");
    expect(cycleContaining(c31, new Date("2026-03-31T00:00:00Z")).key).toBe("2026-03-31");
    expect(cycleContaining(c31, new Date("2026-04-30T00:00:00Z")).key).toBe("2026-04-30");
  });
  it("handles a leap-year February for anchor 29", () => {
    const c29 = new Date("2027-12-29T00:00:00Z");
    expect(cycleContaining(c29, new Date("2028-02-29T00:00:00Z")).key).toBe("2028-02-29");
    expect(cycleContaining(c29, new Date("2028-02-28T00:00:00Z")).key).toBe("2028-01-29");
  });
  it("cycles tile with no gap or overlap", () => {
    const c = cycleContaining(created, new Date("2026-06-01T00:00:00Z"));
    expect(previousCycle(created, cycleContaining(created, c.endExclusive)).endExclusive.getTime()).toBe(c.endExclusive.getTime());
    expect(cycleContaining(created, c.endExclusive).start.getTime()).toBe(c.endExclusive.getTime());
  });
});

describe("cycleEndingOn", () => {
  const created = new Date("2026-03-14T09:30:00Z");
  it("returns the cycle that ended on a boundary day", () => {
    expect(cycleEndingOn(created, d("2026-11-14"))?.key).toBe("2026-10-14");
  });
  it("returns null on any other day", () => {
    expect(cycleEndingOn(created, d("2026-11-15"))).toBeNull();
  });
  it("returns null on the registration day itself (no earlier cycle exists)", () => {
    expect(cycleEndingOn(created, d("2026-03-14"))).toBeNull();
  });
  it("returns the first real cycle one month after registration", () => {
    expect(cycleEndingOn(created, d("2026-04-14"))?.key).toBe("2026-03-14");
  });
});

describe("parseCycleKey", () => {
  it("accepts real dates only", () => {
    expect(parseCycleKey("2026-10-14")?.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(parseCycleKey("2026-02-30")).toBeNull();
    expect(parseCycleKey("2026-10")).toBeNull();
    expect(parseCycleKey("x")).toBeNull();
  });
});
