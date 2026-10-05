import { describe, it, expect } from "vitest";
import { plivoErrorFromMeta } from "./meta-errors.js";

describe("plivoErrorFromMeta", () => {
  it.each([
    [131047, "380"], [132001, "340"], [132000, "350"], [133010, "310"],
    [131031, "360"], [130429, "370"], [131056, "370"], [131051, "330"],
  ])("maps Meta %i to Plivo %s", (meta, plivo) => { expect(plivoErrorFromMeta(meta)).toBe(plivo); });
  it("returns null for unknown or missing codes", () => {
    expect(plivoErrorFromMeta(999999)).toBeNull();
    expect(plivoErrorFromMeta(null)).toBeNull();
    expect(plivoErrorFromMeta(undefined)).toBeNull();
  });
});
