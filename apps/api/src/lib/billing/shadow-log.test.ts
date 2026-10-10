import { describe, it, expect, beforeEach } from "vitest";
import { shouldLogShadow, resetShadowLogForTests, shadowLogSizeForTests } from "./shadow-log.js";

const HOUR = 60 * 60 * 1000;

describe("shouldLogShadow", () => {
  beforeEach(() => resetShadowLogForTests());

  it("is true the first time and false for repeats within the TTL", () => {
    expect(shouldLogShadow("a", 1000)).toBe(true);
    expect(shouldLogShadow("a", 1001)).toBe(false);
    expect(shouldLogShadow("a", 1000 + HOUR - 1)).toBe(false);
  });
  it("is true again after the TTL", () => {
    expect(shouldLogShadow("a", 1000)).toBe(true);
    expect(shouldLogShadow("a", 1000 + HOUR)).toBe(true);
    expect(shouldLogShadow("a", 1000 + HOUR + 1)).toBe(false);
  });
  it("keeps distinct keys independent", () => {
    expect(shouldLogShadow("a", 1000)).toBe(true);
    expect(shouldLogShadow("b", 1000)).toBe(true);
    expect(shouldLogShadow("a", 1000)).toBe(false);
  });
  it("stays bounded", () => {
    for (let i = 0; i < 20000; i++) shouldLogShadow(`k${i}`, 1000);
    expect(shadowLogSizeForTests()).toBeLessThanOrEqual(5000);
    for (let i = 0; i < 6000; i++) shouldLogShadow(`z${i}`, 1000 + 2 * HOUR);
    expect(shadowLogSizeForTests()).toBeLessThanOrEqual(5000);
  });
});
