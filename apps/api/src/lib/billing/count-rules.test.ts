import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { shouldCount, loadCountRules, clearCountRulesCache, type CountRules } from "./count-rules.js";

describe("shouldCount", () => {
  const none: CountRules = new Map();
  it("follows Meta by default", () => {
    expect(shouldCount(none, "regular", "marketing")).toBe(true);
    expect(shouldCount(none, "free_customer_service", "service")).toBe(false);
    expect(shouldCount(none, "weird", null)).toBe(false);
  });
  it("never excludes a category even when Meta charges", () => {
    expect(shouldCount(new Map([["utility", "never" as const]]), "regular", "utility")).toBe(false);
    expect(shouldCount(new Map([["utility", "never" as const]]), "regular", "marketing")).toBe(true);
  });
  it("always counts a category Meta reported as free", () => {
    expect(shouldCount(new Map([["service", "always" as const]]), "free_customer_service", "service")).toBe(true);
  });
  it("uses the unknown key when Meta sends no category", () => {
    expect(shouldCount(new Map([["unknown", "never" as const]]), "regular", null)).toBe(false);
  });
});

describe("loadCountRules", () => {
  const findMany = vi.fn();
  const prisma = { billingCountRule: { findMany } } as unknown as PrismaClient;
  beforeEach(() => { findMany.mockReset(); clearCountRulesCache(); });
  it("caches for 60 seconds and ignores invalid modes", async () => {
    findMany.mockResolvedValue([{ category: "a", mode: "never" }, { category: "b", mode: "bogus" }]);
    const r1 = await loadCountRules(prisma, 1000);
    expect([...r1]).toEqual([["a", "never"]]);
    await loadCountRules(prisma, 30_000);
    expect(findMany).toHaveBeenCalledTimes(1);
    await loadCountRules(prisma, 62_000);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
  it("falls back to the last known rules, or follow-Meta, when the read fails", async () => {
    findMany.mockRejectedValue(new Error("down"));
    expect((await loadCountRules(prisma, 1000)).size).toBe(0);
    findMany.mockReset().mockResolvedValueOnce([{ category: "a", mode: "never" }]);
    clearCountRulesCache();
    await loadCountRules(prisma, 5000);
    findMany.mockRejectedValue(new Error("down"));
    expect([...(await loadCountRules(prisma, 100_000))]).toEqual([["a", "never"]]);
  });
});
