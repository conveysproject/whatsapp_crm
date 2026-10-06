import { describe, it, expect } from "vitest";
import { normalizeMetaError, formatMetaError, redactForLog } from "./meta-error.js";

describe("normalizeMetaError", () => {
  it("normalizes a webhook error entry", () => {
    expect(
      normalizeMetaError({ code: 131049, title: "Healthy ecosystem", message: "Blocked", error_data: { details: "d" }, href: "https://x", extra: "no" }),
    ).toEqual({ code: 131049, subcode: null, title: "Healthy ecosystem", message: "Blocked", details: "d", href: "https://x" });
  });
  it("normalizes a Graph body and its inner object", () => {
    const inner = { message: "bad", type: "OAuthException", code: 190, error_subcode: 463, error_data: { details: "x" }, fbtrace_id: "t" };
    const expected = { code: 190, subcode: 463, title: null, message: "bad", details: "x", href: null };
    expect(normalizeMetaError({ error: inner })).toEqual(expected);
    expect(normalizeMetaError(inner)).toEqual(expected);
  });
  it("returns null for nothing usable / odd input", () => {
    for (const v of [null, undefined, "str", 5, [], [{ code: 1 }], {}, { error: "x" }, { error: {} }, { code: "1", message: 5 }]) {
      expect(normalizeMetaError(v)).toBeNull();
    }
  });
  it("truncates strings and rejects non-integer numbers", () => {
    const r = normalizeMetaError({ code: 1.5, message: "a".repeat(10000), title: "t" });
    expect(r?.message).toHaveLength(500);
    expect(r?.code).toBeNull();
    expect(normalizeMetaError({ code: Infinity, title: "t" })?.code).toBeNull();
    expect(normalizeMetaError({ code: NaN, title: "t" })?.code).toBeNull();
  });
  it("ignores prototype keys and unknown fields", () => {
    const evil = JSON.parse('{"__proto__":{"code":5},"constructor":{"x":1},"title":"t"}');
    const r = normalizeMetaError(evil);
    expect(r).toEqual({ code: null, subcode: null, title: "t", message: null, details: null, href: null });
    expect(normalizeMetaError(Object.create({ code: 7, title: "inherited" }))).toBeNull();
  });
  it("does not throw on hostile getters", () => {
    const o = {};
    Object.defineProperty(o, "code", { get() { throw new Error("boom"); }, enumerable: true });
    expect(normalizeMetaError(o)).toBeNull();
  });
});

describe("formatMetaError", () => {
  it("formats all parts", () => {
    expect(formatMetaError({ code: 131049, subcode: null, title: "T", message: "M", details: "D", href: null })).toBe("131049: T — M (D)");
  });
  it("omits missing parts", () => {
    expect(formatMetaError({ code: 1, subcode: null, title: null, message: "M", details: null, href: null })).toBe("1: M");
    expect(formatMetaError({ code: null, subcode: null, title: "T", message: null, details: "D", href: null })).toBe("T (D)");
    expect(formatMetaError({ code: 5, subcode: null, title: null, message: null, details: null, href: null })).toBe("5");
  });
  it("says Unknown error when empty", () => {
    expect(formatMetaError(null)).toBe("Unknown error");
    expect(formatMetaError({ code: null, subcode: null, title: null, message: null, details: null, href: null })).toBe("Unknown error");
  });
});

describe("redactForLog", () => {
  it("redacts phone-number-like digit runs", () => {
    expect(redactForLog("to +971 50 123 4567 failed")).toBe("to [redacted] failed");
    expect(redactForLog("num 919876543210 bad")).toBe("num [redacted] bad");
    expect(redactForLog("a 971-50-123-4567 b")).toBe("a [redacted] b");
  });
  it("keeps short numbers and error codes", () => {
    expect(redactForLog("code=131049 port 8080")).toBe("code=131049 port 8080");
  });
  it("handles huge input quickly", () => {
    const s = "1 ".repeat(50000);
    expect(redactForLog(s).length).toBeLessThan(s.length);
  });
});
