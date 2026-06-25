import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// We only need the two Prisma models this helper touches
const mockPrisma = {
  organization: { findUnique: vi.fn() },
  businessHours: { findMany: vi.fn() },
};

// Dynamic import so mocks are in place before the module loads
async function getHelper() {
  const { isWithinBusinessHours } = await import("./automation-trigger.js");
  return isWithinBusinessHours;
}

describe("isWithinBusinessHours", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} }); // UTC
  });

  it("returns true when `now` falls inside a slot (UTC Mon 10:00)", async () => {
    // 2026-06-22 is a Monday
    const now = new Date("2026-06-22T10:00:00.000Z"); // Mon 10:00 UTC
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(true);
  });

  it("returns false when `now` is before slot start (UTC Mon 08:59)", async () => {
    const now = new Date("2026-06-22T08:59:00.000Z");
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when `now` is after slot end (UTC Mon 18:00 exactly)", async () => {
    const now = new Date("2026-06-22T18:00:00.000Z");
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when no slots are configured", async () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    mockPrisma.businessHours.findMany.mockResolvedValue([]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when now is on a day with no slot configured (Saturday)", async () => {
    const now = new Date("2026-06-20T10:00:00.000Z"); // Sat 10:00 UTC
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }, // Mon only
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns true for second slot in a split-shift day", async () => {
    const now = new Date("2026-06-22T14:00:00.000Z"); // Mon 14:00
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "13:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(true);
  });
});
