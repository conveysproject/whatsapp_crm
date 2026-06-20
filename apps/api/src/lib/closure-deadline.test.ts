import { describe, it, expect } from "vitest";
import { computeClosureDeadline } from "./closure-deadline.js";

describe("computeClosureDeadline", () => {
  it("returns createdAt + N days", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    expect(computeClosureDeadline(created, 10).toISOString()).toBe("2026-01-11T00:00:00.000Z");
  });
  it("handles 0 days as same instant", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    expect(computeClosureDeadline(created, 0).getTime()).toBe(created.getTime());
  });
});
