import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cleanupApiRequestLogs, retentionDays, DELETE_BATCH, MAX_BATCHES } from "./usage-cleanup.js";

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

  it("stops at the loop cap", async () => {
    const { prisma, executeRaw } = prismaReturning(Array(MAX_BATCHES + 50).fill(DELETE_BATCH));
    await cleanupApiRequestLogs(prisma, now);
    expect(executeRaw).toHaveBeenCalledTimes(MAX_BATCHES);
  });

  it("one empty pass deletes nothing", async () => {
    const { prisma } = prismaReturning([0]);
    expect(await cleanupApiRequestLogs(prisma, now)).toBe(0);
  });
});
