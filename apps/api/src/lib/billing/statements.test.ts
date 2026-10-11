import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_BILLING_CONFIG } from "./bands.js";
import { priceStatement, previousMonth, generateStatements } from "./statements.js";

describe("priceStatement", () => {
  it("prices from the band table even while prices are unpublished", () => {
    expect(priceStatement("o", "2026-10", 300, DEFAULT_BILLING_CONFIG)).toMatchObject({ bandName: "Free", amountInr: 0, amountUsd: 0 });
    expect(priceStatement("o", "2026-10", 3240, DEFAULT_BILLING_CONFIG)).toMatchObject({ bandName: "Band 1", amountInr: 999, amountUsd: 12 });
    expect(priceStatement("o", "2026-10", 250_000, DEFAULT_BILLING_CONFIG)).toMatchObject({ amountInr: 7999 });
  });
  it("leaves the amount empty for a custom-quote volume", () => {
    expect(priceStatement("o", "2026-10", 250_001, DEFAULT_BILLING_CONFIG)).toMatchObject({ bandName: "Above", amountInr: null, amountUsd: null });
  });
});

describe("previousMonth", () => {
  it("crosses year boundaries in UTC", () => {
    expect(previousMonth(new Date("2026-11-01T00:50:00Z"))).toBe("2026-10");
    expect(previousMonth(new Date("2027-01-01T00:00:00Z"))).toBe("2026-12");
  });
});

describe("generateStatements", () => {
  const groupBy = vi.fn();
  const findMany = vi.fn();
  const create = vi.fn();
  const updateMany = vi.fn();
  const findUnique = vi.fn();
  const prisma = {
    messageUsageDaily: { groupBy },
    billingStatement: { findMany, create, updateMany },
    billingSetting: { findUnique },
  } as unknown as PrismaClient;
  const now = new Date("2026-11-01T01:00:00Z");

  beforeEach(() => {
    [groupBy, findMany, create, updateMany, findUnique].forEach((m) => m.mockReset());
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([]);
  });

  it("refuses an unfinished or invalid month", async () => {
    await expect(generateStatements(prisma, "2026-11", now)).rejects.toThrow("not finished");
    await expect(generateStatements(prisma, "nope", now)).rejects.toThrow("invalid");
    expect(create).not.toHaveBeenCalled();
  });
  it("creates drafts, refreshes drafts, skips issued ones and ignores empty organizations", async () => {
    groupBy.mockResolvedValue([
      { organizationId: "new", _sum: { billableCount: 3240 } },
      { organizationId: "draft", _sum: { billableCount: 100 } },
      { organizationId: "issued", _sum: { billableCount: 900 } },
      { organizationId: "zero", _sum: { billableCount: 0 } },
    ]);
    findMany.mockResolvedValue([{ organizationId: "draft", status: "draft" }, { organizationId: "issued", status: "issued" }]);
    const res = await generateStatements(prisma, "2026-10", now);
    expect(res).toEqual({ created: 1, refreshed: 1, skipped: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({ organizationId: "new", status: "draft", bandName: "Band 1", amountInr: 999 });
    expect(updateMany.mock.calls[0]![0].where).toEqual({ organizationId: "draft", month: "2026-10", status: "draft" });
  });
});
