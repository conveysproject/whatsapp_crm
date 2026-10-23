import { describe, expect, it } from "vitest";
import { buildFrom, isPlainEmail, isValidFromName, sanitizeFromName } from "./mail-from";

describe("sanitizeFromName", () => {
  it.each([
    ["Acme Msgs", "Acme Msgs"],
    ["Evil\r\nBcc: x@y.z", "Evil Bcc: x@y.z"],
    ['Quo"ted', "Quoted"],
    ["A <b@c.d>", "A b@c.d"],
    ["back\\slash, comma; semi", "backslash comma semi"],
    ["  many   spaces  ", "many spaces"],
    ["nul\u0000byte\u0007bell", "nul byte bell"],
    ["x".repeat(200), "x".repeat(60)],
    ["\r\n\u0000\t", "WBMSG"],
    ['"<>\,;', "WBMSG"],
    ["", "WBMSG"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeFromName(input)).toBe(expected);
  });
  it("falls back to WBMSG when absent or not a string", () => {
    expect(sanitizeFromName(undefined)).toBe("WBMSG");
    expect(sanitizeFromName(42)).toBe("WBMSG");
  });
  it("never leaves a CR, LF or NUL", () => {
    expect(sanitizeFromName("a\r\nb\nc\rd\u0000e")).not.toMatch(/[\r\n\u0000]/);
  });
});

// KEEP IN SYNC with PLAIN_EMAIL_CASES in apps/api/src/lib/brand.test.ts (same literal, same rules).
const PLAIN_EMAIL_CASES: [string, boolean][] = [
  ["help@acme.test", true],
  ["help+tag@acme.test", true],
  ["help@mail.sub.acme.test", true],
  ["o'brien@x.com", false],
  ["a,b@x.com", false],
  ["a;b@x.com", false],
  ["a(b)@x.com", false],
  ["a[b]@x.com", false],
  ["a:b@x.com", false],
  ["a\\b@x.com", false],
  ["<a@x.com>", false],
  ['a"b@x.com', false],
  ["a b@x.com", false],
  ["a@b@x.com", false],
  ["a@xcom", false],
  [`${"a".repeat(250)}@x.com`, false],
];

describe("isPlainEmail table", () => {
  it.each(PLAIN_EMAIL_CASES)("%j -> %s", (input, expected) => {
    expect(isPlainEmail(input)).toBe(expected);
  });
});

describe("buildFrom", () => {
  it("uses the address object form with the sanitized name", () => {
    expect(buildFrom("Evil\r\nBcc: x@y.z", "smtp@example.com")).toEqual({ name: "Evil Bcc: x@y.z", address: "smtp@example.com" });
    expect(buildFrom(undefined, "smtp@example.com")).toEqual({ name: "WBMSG", address: "smtp@example.com" });
  });
});

describe("isValidFromName / isPlainEmail", () => {
  it("fromName must be 1-60 chars after trim", () => {
    expect(isValidFromName("Acme")).toBe(true);
    expect(isValidFromName("x".repeat(60))).toBe(true);
    expect(isValidFromName("x".repeat(61))).toBe(false);
    expect(isValidFromName("   ")).toBe(false);
    expect(isValidFromName("")).toBe(false);
    expect(isValidFromName(5)).toBe(false);
    expect(isValidFromName(null)).toBe(false);
  });
  it("replyTo must be one plain address", () => {
    expect(isPlainEmail("help@acme.test")).toBe(true);
    for (const bad of [
      "a@b.co\r\nBcc: x@y.z",
      "a@b.co\nBcc: x@y.z",
      "a@b.co, c@d.ef",
      "a@b.co;c@d.ef",
      "Name <a@b.co>",
      "<a@b.co>",
      '"a"@b.co',
      "no-at-sign",
      "a b@c.de",
      42,
    ]) {
      expect(isPlainEmail(bad)).toBe(false);
    }
  });
});
