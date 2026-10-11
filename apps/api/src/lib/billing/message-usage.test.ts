import { describe, it, expect } from "vitest";
import { buildMessageUsage } from "./message-usage.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const from = d("2026-10-01");
const toExclusive = d("2026-11-01");

describe("buildMessageUsage", () => {
  it("sums billable counts and merges sources, ignoring non-numeric values", () => {
    const res = buildMessageUsage(
      [
        { day: d("2026-10-02"), billableCount: 5, bySource: { campaign: 3, unknown: 2 }, computedAt: new Date("2026-10-10T01:05:00Z") },
        { day: d("2026-10-03"), billableCount: 4, bySource: { campaign: 1, api: 3, junk: "x", bad: null }, computedAt: new Date("2026-10-10T02:05:00Z") },
      ],
      from, toExclusive, new Date("2026-10-10T12:00:00Z"),
    );
    expect(res.billable).toBe(9);
    expect(res.bySource).toEqual({ campaign: 4, unknown: 2, api: 3 });
    expect(res.updatedAt).toBe("2026-10-10T02:05:00.000Z");
  });

  it("returns a continuous daily series from the 1st up to today (UTC) with zeros for quiet days", () => {
    const res = buildMessageUsage(
      [{ day: d("2026-10-03"), billableCount: 4, bySource: {}, computedAt: new Date() }],
      from, toExclusive, new Date("2026-10-05T23:59:59.999Z"),
    );
    expect(res.daily).toEqual([
      { day: "2026-10-01", billable: 0 },
      { day: "2026-10-02", billable: 0 },
      { day: "2026-10-03", billable: 4 },
      { day: "2026-10-04", billable: 0 },
      { day: "2026-10-05", billable: 0 },
    ]);
  });

  it("covers the whole month for a past month", () => {
    const res = buildMessageUsage([], from, toExclusive, new Date("2026-12-15T00:00:00Z"));
    expect(res.daily).toHaveLength(31);
    expect(res.daily[30]).toEqual({ day: "2026-10-31", billable: 0 });
  });

  it("is empty for a future month and tolerates no rows", () => {
    const res = buildMessageUsage([], d("2027-01-01"), d("2027-02-01"), new Date("2026-10-10T00:00:00Z"));
    expect(res).toEqual({ billable: 0, bySource: {}, daily: [], updatedAt: null });
  });

  it("tolerates a malformed bySource value", () => {
    const res = buildMessageUsage(
      [{ day: d("2026-10-01"), billableCount: 2, bySource: "oops", computedAt: new Date("2026-10-02T00:00:00Z") }],
      from, toExclusive, new Date("2026-10-02T00:00:00Z"),
    );
    expect(res.bySource).toEqual({});
    expect(res.billable).toBe(2);
  });
});
