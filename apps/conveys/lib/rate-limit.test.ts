import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetForTesting } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("allows the first request from an IP", () => {
    expect(checkRateLimit("1.2.3.4")).toBe(true);
  });

  it("allows up to 5 requests from the same IP within the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("1.2.3.4")).toBe(true);
    }
  });

  it("blocks the 6th request from the same IP", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("1.2.3.4")).toBe(false);
  });

  it("does not block a different IP", () => {
    for (let i = 0; i < 6; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("9.8.7.6")).toBe(true);
  });
});
