import { describe, it, expect } from "vitest";
import { formatDuration, formatDurationCoarse, relativeTime, formatDelta } from "./format";

describe("formatDuration", () => {
  it("preserves the existing outputs", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3900)).toBe("1h 5m");
    expect(formatDuration(3600)).toBe("1h");
  });
  it("returns a dash for null", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatDurationCoarse (TeamLeaderboard variant)", () => {
  it("drops seconds above one minute, as before", () => {
    expect(formatDurationCoarse(0)).toBe("—");
    expect(formatDurationCoarse(45)).toBe("45s");
    expect(formatDurationCoarse(125)).toBe("2m");
    expect(formatDurationCoarse(3900)).toBe("1h 5m");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("formats the existing buckets", () => {
    expect(relativeTime("2026-10-10T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-10T11:55:00Z", now)).toBe("5m ago");
    expect(relativeTime("2026-10-10T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-10-08T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("formatDelta", () => {
  it("null -> dash with no direction", () => {
    expect(formatDelta(null)).toEqual({ text: "—", up: null });
  });
  it("positive, negative, zero", () => {
    expect(formatDelta(12.5)).toEqual({ text: "12.5%", up: true });
    expect(formatDelta(-8)).toEqual({ text: "8%", up: false });
    expect(formatDelta(0)).toEqual({ text: "0%", up: null });
  });
  it("rounds to one decimal and guards non-finite", () => {
    expect(formatDelta(33.333)).toEqual({ text: "33.3%", up: true });
    expect(formatDelta(Number.NaN)).toEqual({ text: "—", up: null });
  });
});
