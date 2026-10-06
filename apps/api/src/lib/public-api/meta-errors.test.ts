import { describe, it, expect } from "vitest";
import { plivoErrorFromMeta } from "./meta-errors.js";

describe("plivoErrorFromMeta", () => {
  it.each([
    [131047, "380"], [132001, "340"], [132000, "350"], [133010, "310"],
    [131031, "360"], [130429, "370"], [131056, "370"], [131051, "330"],
  ])("maps Meta %i to Plivo %s", (meta, plivo) => { expect(plivoErrorFromMeta(meta)).toBe(plivo); });
  it("passes an unmapped Meta code through as its own digits so the real reason is never lost", () => {
    expect(plivoErrorFromMeta(131049)).toBe("131049"); // marketing message not delivered (ecosystem engagement)
    expect(plivoErrorFromMeta(131026)).toBe("131026"); // message undeliverable
    expect(plivoErrorFromMeta(999999)).toBe("999999");
  });
  it("returns null for missing or invalid codes (nothing to report)", () => {
    for (const bad of [null, undefined, 0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(plivoErrorFromMeta(bad)).toBeNull();
    }
  });
  it("mapped codes still win over the passthrough", () => {
    expect(plivoErrorFromMeta(131047)).toBe("380");
  });
});
