import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { computeDailyUsage, storeDailyUsage } = vi.hoisted(() => ({ computeDailyUsage: vi.fn(), storeDailyUsage: vi.fn() }));
vi.mock("./metering.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), computeDailyUsage, storeDailyUsage }));
import { runMeteringSweep } from "./metering-sweep.js";

const prisma = {} as PrismaClient;
beforeEach(() => { computeDailyUsage.mockReset().mockResolvedValue([]); storeDailyUsage.mockReset().mockResolvedValue({ upserted: 0, removed: 0 }); });

describe("runMeteringSweep", () => {
  it("recomputes today and yesterday (UTC), yesterday first", async () => {
    const res = await runMeteringSweep(prisma, new Date("2026-10-10T00:30:00Z"));
    expect(res.days).toEqual(["2026-10-09", "2026-10-10"]);
    expect(computeDailyUsage).toHaveBeenCalledTimes(2);
    expect(storeDailyUsage).toHaveBeenCalledTimes(2);
  });
  it("sums upserts and removals and survives one failing day", async () => {
    computeDailyUsage.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce([{ organizationId: "a", billable: 1, bySource: { unknown: 1 } }]);
    storeDailyUsage.mockResolvedValue({ upserted: 1, removed: 2 });
    const res = await runMeteringSweep(prisma, new Date("2026-10-10T12:00:00Z"));
    expect(res).toEqual({ days: ["2026-10-10"], upserted: 1, removed: 2 });
  });
  it("lookbackDays 5 processes six days, oldest first", async () => {
    const res = await runMeteringSweep(prisma, new Date("2026-10-10T00:40:00Z"), 5);
    expect(res.days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(computeDailyUsage).toHaveBeenCalledTimes(6);
  });
  it("skips a failing day and continues with the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      computeDailyUsage.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("boom"));
      const res = await runMeteringSweep(prisma, new Date("2026-10-10T12:00:00Z"), 3);
      expect(res.days).toEqual(["2026-10-07", "2026-10-09", "2026-10-10"]);
    } finally { warn.mockRestore(); }
  });
});
