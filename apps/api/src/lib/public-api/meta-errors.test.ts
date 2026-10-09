import { describe, it, expect } from "vitest";
import { plivoErrorFromMeta, errorMessageForCode } from "./meta-errors.js";

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

describe("errorMessageForCode", () => {
  it("maps the 24-hour window code to a sentence that tells the client what to do", () => {
    expect(errorMessageForCode("380")).toMatch(/24 hours/);
    expect(errorMessageForCode("131047")).toMatch(/24 hours/);
  });
  it("uses the exact reworded 370 sentence", () => {
    expect(errorMessageForCode("370")).toBe("WhatsApp is limiting sending from this number right now (too many messages too fast, too many to one recipient, or a spam/quality restriction). Retry later; if it persists, check your number's quality in WBMSG or contact support.");
  });
  it("gives a generic sentence that still contains an unknown Meta code", () => {
    expect(errorMessageForCode("139999")).toBe("WhatsApp could not deliver the message (code 139999).");
  });
  it("returns null for no code", () => { expect(errorMessageForCode(null)).toBeNull(); });
  it("never mentions the competitor name", () => {
    for (const c of ["310", "330", "340", "350", "360", "370", "380", "131047", "131049", "131026"]) {
      expect(errorMessageForCode(c)).not.toMatch(/plivo/i);
    }
  });
});
