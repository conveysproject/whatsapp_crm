import { describe, expect, it } from "vitest";
import { toE164 } from "./phone.js";

describe("toE164", () => {
  it("normalizes valid international numbers to +digits", () => {
    expect(toE164("+91 87795 06101")).toBe("+918779506101");
    expect(toE164("918779506101")).toBe("+918779506101");
    expect(toE164(" +1 (415) 555-2671 ")).toBe("+14155552671");
  });
  it("rejects junk, partial and over-long input", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("abc")).toBeNull();
    expect(toE164("12345")).toBeNull();
    expect(toE164("+" + "9".repeat(30))).toBeNull();
  });
});
