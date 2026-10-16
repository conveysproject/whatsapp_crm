import { describe, it, expect } from "vitest";
import { newAccountId, normalizeEmail } from "./ids.js";

describe("newAccountId", () => {
  it("matches usr_ + 26 base32 chars", () => {
    expect(newAccountId()).toMatch(/^usr_[a-z2-7]{26}$/);
  });
  it("is unique across 1000 calls", () => {
    const set = new Set(Array.from({ length: 1000 }, () => newAccountId()));
    expect(set.size).toBe(1000);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases only", () => {
    expect(normalizeEmail("  Foo@X.COM ")).toBe("foo@x.com");
    expect(normalizeEmail("A.B+tag@Gmail.com")).toBe("a.b+tag@gmail.com");
  });
});
