import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE_LINK_RELEASED_AT, parseReleasedAt } from "./template-link-release.js";

describe("parseReleasedAt", () => {
  it("defaults to 2026-10-20 when unset or empty", () => {
    expect(DEFAULT_TEMPLATE_LINK_RELEASED_AT.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(parseReleasedAt(undefined)).toEqual(DEFAULT_TEMPLATE_LINK_RELEASED_AT);
    expect(parseReleasedAt("")).toEqual(DEFAULT_TEMPLATE_LINK_RELEASED_AT);
  });
  it("accepts a valid ISO date", () => {
    expect(parseReleasedAt("2026-11-01T00:00:00Z").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("falls back to the default for an invalid value", () => {
    expect(parseReleasedAt("not-a-date")).toEqual(DEFAULT_TEMPLATE_LINK_RELEASED_AT);
  });
});
