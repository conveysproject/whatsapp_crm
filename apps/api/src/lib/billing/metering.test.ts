import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { utcDayStart, utcDayKey, parseMonth, percentile, bucketOf, computeDailyUsage, storeDailyUsage } from "./metering.js";

describe("day math", () => {
  it("buckets by UTC day with exact boundaries", () => {
    expect(utcDayStart(new Date("2026-10-10T23:59:59.999Z")).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(utcDayStart(new Date("2026-10-11T00:00:00.000Z")).toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(utcDayKey(new Date("2026-10-10T23:59:59.999Z"))).toBe("2026-10-10");
  });
  it("parses months into UTC ranges and rejects bad input", () => {
    const r = parseMonth("2026-02");
    expect(r?.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(r?.toExclusive.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(r?.days).toBe(28);
    expect(parseMonth("2026-12")?.toExclusive.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(parseMonth("2028-02")?.days).toBe(29);
    for (const bad of ["2026-13", "2026-00", "2026-1", "26-01", "2026/01", "", "abcd-ef"]) expect(parseMonth(bad)).toBeNull();
  });
});

describe("percentile and bucket", () => {
  it("uses nearest-rank and is 0 for empty", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(a, 50)).toBe(5);
    expect(percentile(a, 90)).toBe(9);
    expect(percentile(a, 99)).toBe(10);
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 99)).toBe(7);
  });
  it("assigns volume buckets at the boundaries", () => {
    expect([0, 99, 100, 999, 1000, 4999, 5000, 24999, 25000, 99999, 100000].map(bucketOf)).toEqual(
      ["0-99", "0-99", "100-999", "100-999", "1k-4.9k", "1k-4.9k", "5k-24.9k", "5k-24.9k", "25k-99.9k", "25k-99.9k", "100k+"]);
  });
});

describe("computeDailyUsage", () => {
  const queryRaw = vi.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
  beforeEach(() => { queryRaw.mockReset(); });

  it("groups per org and folds NULL source into unknown", async () => {
    queryRaw.mockResolvedValue([
      { organization_id: "a", source: null, n: 3 },
      { organization_id: "a", source: "campaign", n: 2 },
      { organization_id: "b", source: "api", n: 1 },
    ]);
    const rows = await computeDailyUsage(prisma, new Date("2026-10-10T05:00:00Z"));
    expect(rows).toEqual([
      { organizationId: "a", billable: 5, bySource: { unknown: 3, campaign: 2 } },
      { organizationId: "b", billable: 1, bySource: { api: 1 } },
    ]);
  });
  it("binds exactly the UTC day start and next day start and keeps the billable filters", async () => {
    queryRaw.mockResolvedValue([]);
    await computeDailyUsage(prisma, new Date("2026-10-10T05:00:00Z"));
    const sql = queryRaw.mock.calls[0]![0] as { values: unknown[]; sql: string };
    expect(sql.values.map((v) => (v as Date).toISOString())).toEqual(["2026-10-10T00:00:00.000Z", "2026-10-11T00:00:00.000Z"]);
    const text = sql.sql.replace(/\s+/g, " ");
    expect(text).toContain("sent_at >= ? AND sent_at < ?");
    expect(text).toContain("direction = 'outbound'");
    expect(text).toContain("status IN ('sent','delivered','read')");
    expect(text).toContain("is_system_message = false");
  });
  it("returns an empty list when there are no messages", async () => {
    queryRaw.mockResolvedValue([]);
    expect(await computeDailyUsage(prisma, new Date("2026-10-10T00:00:00Z"))).toEqual([]);
  });
});

describe("storeDailyUsage", () => {
  const upsert = vi.fn();
  const deleteMany = vi.fn();
  const prisma = { $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({ messageUsageDaily: { upsert, deleteMany } })) } as unknown as PrismaClient;
  beforeEach(() => { upsert.mockReset(); deleteMany.mockReset().mockResolvedValue({ count: 0 }); });
  const day = new Date("2026-10-10T12:00:00Z");

  it("upserts each org for the UTC day and removes stale rows for that day", async () => {
    deleteMany.mockResolvedValue({ count: 2 });
    const res = await storeDailyUsage(prisma, day, [{ organizationId: "a", billable: 5, bySource: { unknown: 5 } }], new Date("2026-10-10T13:00:00Z"));
    expect(res).toEqual({ upserted: 1, removed: 2 });
    expect(upsert).toHaveBeenCalledWith({
      where: { organizationId_day: { organizationId: "a", day: new Date("2026-10-10T00:00:00.000Z") } },
      create: { organizationId: "a", day: new Date("2026-10-10T00:00:00.000Z"), billableCount: 5, bySource: { unknown: 5 }, computedAt: new Date("2026-10-10T13:00:00Z") },
      update: { billableCount: 5, bySource: { unknown: 5 }, computedAt: new Date("2026-10-10T13:00:00Z") },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { day: new Date("2026-10-10T00:00:00.000Z"), organizationId: { notIn: ["a"] } } });
  });
  it("with no rows it deletes every row of that day", async () => {
    await storeDailyUsage(prisma, day, []);
    expect(deleteMany).toHaveBeenCalledWith({ where: { day: new Date("2026-10-10T00:00:00.000Z") } });
  });
});
