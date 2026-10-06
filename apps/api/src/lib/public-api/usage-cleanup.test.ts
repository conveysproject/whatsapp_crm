import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cleanupApiRequestLogs, retentionDays, DELETE_BATCH, CLEANUP_BUDGET_MS } from "./usage-cleanup.js";

afterEach(() => { delete process.env["API_REQUEST_LOG_RETENTION_DAYS"]; });

function prismaReturning(counts: number[]) {
  const calls: Array<{ strings: string[]; values: unknown[] }> = [];
  const executeRaw = vi.fn(async (strings: string[], ...values: unknown[]) => {
    calls.push({ strings: [...strings], values });
    return counts.shift() ?? 0;
  });
  return { prisma: { $executeRaw: executeRaw } as unknown as PrismaClient, calls, executeRaw };
}

describe("retentionDays", () => {
  it("defaults to 30 and falls back on bad values", () => {
    expect(retentionDays()).toBe(30);
    for (const bad of ["", "abc", "0", "-5"]) { process.env["API_REQUEST_LOG_RETENTION_DAYS"] = bad; expect(retentionDays(), bad).toBe(30); }
    process.env["API_REQUEST_LOG_RETENTION_DAYS"] = "7";
    expect(retentionDays()).toBe(7);
  });
  it("enforces a minimum of 2 days", () => {
    process.env["API_REQUEST_LOG_RETENTION_DAYS"] = "1";
    expect(retentionDays()).toBe(2);
    process.env["API_REQUEST_LOG_RETENTION_DAYS"] = "2";
    expect(retentionDays()).toBe(2);
    process.env["API_REQUEST_LOG_RETENTION_DAYS"] = "3";
    expect(retentionDays()).toBe(3);
  });
});

describe("cleanupApiRequestLogs", () => {
  const now = new Date("2026-10-06T02:00:00Z");

  it("deletes in batches until a short batch, using a parameterized cutoff of now - retention", async () => {
    const { prisma, calls } = prismaReturning([DELETE_BATCH, DELETE_BATCH, 17]);
    const total = await cleanupApiRequestLogs(prisma, now);
    expect(total).toBe(DELETE_BATCH * 2 + 17);
    expect(calls).toHaveLength(3);
    const sql = calls[0]!.strings.join("?");
    expect(sql).toMatch(/DELETE FROM api_request_logs/);
    expect(sql).toMatch(/LIMIT/);
    expect(sql).not.toMatch(/api_usage_daily/);
    expect(calls[0]!.values[0]).toEqual(new Date("2026-09-06T02:00:00Z"));
    expect(calls[0]!.values).toContain(DELETE_BATCH);
  });

  it("honours API_REQUEST_LOG_RETENTION_DAYS", async () => {
    process.env["API_REQUEST_LOG_RETENTION_DAYS"] = "7";
    const { prisma, calls } = prismaReturning([0]);
    await cleanupApiRequestLogs(prisma, now);
    expect(calls[0]!.values[0]).toEqual(new Date("2026-09-29T02:00:00Z"));
  });

  it("uses the 2-day minimum for the cutoff when retention is set to 1", async () => {
    process.env["API_REQUEST_LOG_RETENTION_DAYS"] = "1";
    const { prisma, calls } = prismaReturning([0]);
    await cleanupApiRequestLogs(prisma, now);
    expect(calls[0]!.values[0]).toEqual(new Date("2026-10-04T02:00:00Z"));
  });

  it("stops when the time budget is spent, even if every batch is full (the next hourly run continues)", async () => {
    const { prisma, executeRaw } = prismaReturning(Array(1000).fill(DELETE_BATCH));
    let t = 0;
    const clock = () => (t += 10_000); // each clock read advances 10 s
    const total = await cleanupApiRequestLogs(prisma, now, CLEANUP_BUDGET_MS, clock);
    expect(executeRaw.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(executeRaw.mock.calls.length).toBeLessThanOrEqual(7);
    expect(total).toBe(executeRaw.mock.calls.length * DELETE_BATCH);
  });

  it("keeps going within the budget while batches are full, then stops on a short batch", async () => {
    const { prisma, executeRaw } = prismaReturning([DELETE_BATCH, DELETE_BATCH, DELETE_BATCH, 3]);
    const total = await cleanupApiRequestLogs(prisma, now, CLEANUP_BUDGET_MS, () => 0);
    expect(executeRaw).toHaveBeenCalledTimes(4);
    expect(total).toBe(DELETE_BATCH * 3 + 3);
  });

  it("always runs at least one batch even with a zero budget", async () => {
    const { prisma, executeRaw } = prismaReturning([DELETE_BATCH, DELETE_BATCH]);
    await cleanupApiRequestLogs(prisma, now, 0, () => 0);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("one empty pass deletes nothing", async () => {
    const { prisma } = prismaReturning([0]);
    expect(await cleanupApiRequestLogs(prisma, now)).toBe(0);
  });
});
