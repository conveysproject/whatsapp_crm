import { describe, it, expect } from "vitest";
import { normalizeFullPhone, normalizeSplitPhone, isValidE164 } from "./phone-normalize.js";

describe("normalizeFullPhone", () => {
  it("returns E.164 when given full number with plus", () => {
    expect(normalizeFullPhone("+919748072737")).toBe("+919748072737");
  });

  it("prepends + when missing", () => {
    expect(normalizeFullPhone("919748072737")).toBe("+919748072737");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeFullPhone("+91 97480 72737")).toBe("+919748072737");
  });

  it("returns null for empty string", () => {
    expect(normalizeFullPhone("")).toBeNull();
  });

  it("returns null for non-numeric garbage", () => {
    expect(normalizeFullPhone("not-a-phone")).toBeNull();
  });
});

describe("normalizeSplitPhone", () => {
  it("combines country code and phone into E.164", () => {
    expect(normalizeSplitPhone("91", "9748072737")).toBe("+919748072737");
  });

  it("strips non-digits from both parts", () => {
    expect(normalizeSplitPhone("+91", "(974) 807-2737")).toBe("+919748072737");
  });

  it("returns null when country code is empty", () => {
    expect(normalizeSplitPhone("", "9748072737")).toBeNull();
  });

  it("returns null when phone is empty", () => {
    expect(normalizeSplitPhone("91", "")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("accepts valid E.164", () => {
    expect(isValidE164("+919748072737")).toBe(true);
  });

  it("rejects missing plus", () => {
    expect(isValidE164("919748072737")).toBe(false);
  });

  it("rejects too short", () => {
    expect(isValidE164("+1234")).toBe(false);
  });

  it("rejects too long", () => {
    expect(isValidE164("+" + "2".repeat(17))).toBe(false);
  });
});
