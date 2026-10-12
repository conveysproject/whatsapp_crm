import { describe, it, expect } from "vitest";
import { cancellationText, normalizeCancellation, shortDate } from "./billing-cancellation";

describe("normalizeCancellation", () => {
  it("reads each valid state", () => {
    expect(normalizeCancellation({ status: "requested", requestedAt: "2026-11-01T00:00:00.000Z", approvedAt: null, deleteAfter: null }))
      .toEqual({ status: "requested", requestedAt: "2026-11-01T00:00:00.000Z", approvedAt: null, deleteAfter: null });
    expect(normalizeCancellation({ status: "approved", approvedAt: "2026-11-02T00:00:00.000Z", deleteAfter: "2026-12-02T00:00:00.000Z" })?.status).toBe("approved");
  });
  it("treats anything unexpected as no cancellation", () => {
    for (const bad of [null, undefined, "x", [], {}, { status: "weird" }, { status: 5 }]) expect(normalizeCancellation(bad)).toBeNull();
  });
  it("drops malformed dates", () => {
    expect(normalizeCancellation({ status: "requested", requestedAt: "nope", approvedAt: 5, deleteAfter: {} })).toEqual({ status: "requested", requestedAt: null, approvedAt: null, deleteAfter: null });
  });
});

describe("cancellationText", () => {
  it("tells a requester nothing changes until it is confirmed", () => {
    const t = cancellationText({ status: "requested", requestedAt: "2026-11-01T00:00:00.000Z", approvedAt: null, deleteAfter: null })!;
    expect(t).toContain("1 Nov 2026");
    expect(t).toContain("nothing changes");
  });
  it("tells an approved customer that sending is off and until when they can export", () => {
    const t = cancellationText({ status: "approved", requestedAt: null, approvedAt: "2026-11-02T00:00:00.000Z", deleteAfter: "2026-12-02T00:00:00.000Z" })!;
    expect(t).toContain("Sending is off");
    expect(t).toContain("2 Dec 2026");
    expect(t).toContain("info@conveys.in");
  });
  it("says nothing for a withdrawn request, and copes with missing dates", () => {
    expect(cancellationText({ status: "withdrawn", requestedAt: null, approvedAt: null, deleteAfter: null })).toBeNull();
    expect(cancellationText({ status: "approved", requestedAt: null, approvedAt: null, deleteAfter: null })).toContain("cancelled");
    expect(shortDate(null)).toBe("");
    expect(shortDate("nope")).toBe("");
  });
});
