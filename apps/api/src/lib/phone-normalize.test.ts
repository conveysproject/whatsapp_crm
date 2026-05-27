import { describe, it, expect } from "vitest";
import { normalizeFullPhone, normalizeSplitPhone, isValidPhone } from "./phone-normalize.js";

describe("normalizeFullPhone", () => {
  it("returns digits-only when given full number with plus", () => {
    expect(normalizeFullPhone("+919748072737")).toBe("919748072737");
  });

  it("returns digits-only when plus is missing", () => {
    expect(normalizeFullPhone("919748072737")).toBe("919748072737");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeFullPhone("+91 97480 72737")).toBe("919748072737");
  });

  it("strips Excel =\"...\" wrapper", () => {
    expect(normalizeFullPhone('="919748072737"')).toBe("919748072737");
  });

  it("returns null for empty string", () => {
    expect(normalizeFullPhone("")).toBeNull();
  });

  it("returns null for non-numeric garbage", () => {
    expect(normalizeFullPhone("not-a-phone")).toBeNull();
  });

  it("returns null for local number without country code", () => {
    expect(normalizeFullPhone("9748072737")).toBeNull();
  });
});

describe("normalizeSplitPhone", () => {
  it("combines country code and phone into digits-only", () => {
    expect(normalizeSplitPhone("91", "9748072737")).toBe("919748072737");
  });

  it("strips non-digits from both parts", () => {
    expect(normalizeSplitPhone("+91", "(974) 807-2737")).toBe("919748072737");
  });

  it("returns null when country code is empty", () => {
    expect(normalizeSplitPhone("", "9748072737")).toBeNull();
  });

  it("returns null when phone is empty", () => {
    expect(normalizeSplitPhone("91", "")).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("accepts valid international digits", () => {
    expect(isValidPhone("919748072737")).toBe(true);
  });

  it("rejects local number without country code", () => {
    expect(isValidPhone("9748072737")).toBe(false);
  });

  it("rejects too short", () => {
    expect(isValidPhone("1234")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPhone("")).toBe(false);
  });
});
