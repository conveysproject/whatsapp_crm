import { describe, it, expect } from "vitest";
import { bannerFor, normalizeStanding, standingDate, OK } from "./billing-standing";

describe("normalizeStanding", () => {
  it("reads a valid response", () => {
    expect(normalizeStanding({ state: "blocked", paused: true, dueAt: "2026-11-01T00:00:00.000Z", blockAt: "2026-11-08T00:00:00.000Z" }))
      .toEqual({ state: "blocked", paused: true, dueAt: "2026-11-01T00:00:00.000Z", blockAt: "2026-11-08T00:00:00.000Z" });
  });
  it("never invents a banner from bad data", () => {
    for (const bad of [null, undefined, "x", [], {}, { state: "weird", paused: true }, { state: 5 }]) expect(normalizeStanding(bad)).toEqual(OK);
  });
  it("drops malformed dates and treats a missing paused flag as not paused", () => {
    expect(normalizeStanding({ state: "overdue", dueAt: "nope", blockAt: 5 })).toEqual({ state: "overdue", paused: false, dueAt: null, blockAt: null });
  });
});

describe("bannerFor", () => {
  it("says nothing when everything is fine", () => {
    expect(bannerFor(OK, true)).toBeNull();
  });
  it("warns with the pause date while overdue, and is not alarming", () => {
    const b = bannerFor({ state: "overdue", paused: false, dueAt: "2026-11-01T00:00:00.000Z", blockAt: "2026-11-08T00:00:00.000Z" }, true)!;
    expect(b.tone).toBe("warning");
    expect(b.message).toContain("8 Nov 2026");
    expect(b.message).toContain("Pay it in Settings > Billing");
  });
  it("says sending is paused, and how to resume, once it is actually refused", () => {
    const b = bannerFor({ state: "blocked", paused: true, dueAt: "2026-11-01T00:00:00.000Z", blockAt: "2026-11-08T00:00:00.000Z" }, true)!;
    expect(b.tone).toBe("danger");
    expect(b.message).toContain("paused");
    expect(b.message).toContain("resumes right away");
  });
  it("in watch mode (blocked but not paused) it only warns", () => {
    const b = bannerFor({ state: "blocked", paused: false, dueAt: "2026-11-01T00:00:00.000Z", blockAt: "2026-11-08T00:00:00.000Z" }, true)!;
    expect(b.tone).toBe("warning");
  });
  it("tells someone who cannot open billing to ask a billing admin", () => {
    expect(bannerFor({ state: "overdue", paused: false, dueAt: null, blockAt: "2026-11-08T00:00:00.000Z" }, false)!.message).toContain("Ask a billing admin");
    expect(bannerFor({ state: "blocked", paused: true, dueAt: null, blockAt: null }, false)!.message).toContain("Ask a billing admin");
  });
  it("copes with a missing date", () => {
    expect(bannerFor({ state: "overdue", paused: false, dueAt: null, blockAt: null }, true)!.message).toContain("soon");
    expect(standingDate(null)).toBe("");
    expect(standingDate("nope")).toBe("");
  });
});
