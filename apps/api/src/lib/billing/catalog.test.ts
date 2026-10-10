import { describe, it, expect } from "vitest";
import { PLAN_CATALOG, isBillableTier, isPaidAmountSufficient } from "./catalog.js";

describe("catalog", () => {
  it("knows billable tiers only", () => {
    expect(isBillableTier("starter")).toBe(true);
    expect(isBillableTier("enterprise")).toBe(false);
    expect(isBillableTier("plan-standard")).toBe(false);
    expect(isBillableTier(undefined)).toBe(false);
    expect(isBillableTier("__proto__")).toBe(false);
  });
  it("accepts exact or higher INR payment", () => {
    expect(isPaidAmountSufficient("starter", "INR", PLAN_CATALOG.starter.priceInr * 100)).toBe(true);
    expect(isPaidAmountSufficient("starter", "inr", 100_000)).toBe(true);
  });
  it("rejects underpayment", () => {
    expect(isPaidAmountSufficient("scale", "INR", 100)).toBe(false);
    expect(isPaidAmountSufficient("growth", "USD", 100)).toBe(false);
  });
  it("fails closed for unknown currency or tier", () => {
    expect(isPaidAmountSufficient("starter", "RUB", 10_000_000)).toBe(false);
    expect(isPaidAmountSufficient("enterprise", "INR", 10_000_000)).toBe(false);
    expect(isPaidAmountSufficient("nope", "INR", 10_000_000)).toBe(false);
    expect(isPaidAmountSufficient("starter", "INR", Number.NaN)).toBe(false);
  });
});
