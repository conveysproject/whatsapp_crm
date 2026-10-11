import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_BILLING_CONFIG } from "./bands.js";
import { priceStatement, generateStatements } from "./statements.js";

describe("priceStatement", () => {
  it("prices from the band table even while prices are unpublished", () => {
    expect(priceStatement("o", "2026-10-14", 300, DEFAULT_BILLING_CONFIG)).toMatchObject({ bandName: "Free", amountInr: 0, amountUsd: 0 });
    expect(priceStatement("o", "2026-10-14", 3240, DEFAULT_BILLING_CONFIG)).toMatchObject({ bandName: "Band 1", amountInr: 999, amountUsd: 12 });
    expect(priceStatement("o", "2026-10-14", 250_000, DEFAULT_BILLING_CONFIG)).toMatchObject({ amountInr: 7999 });
  });
  it("leaves the amount empty for a custom-quote volume", () => {
    expect(priceStatement("o", "2026-10-14", 250_001, DEFAULT_BILLING_CONFIG)).toMatchObject({ bandName: "Above", amountInr: null, amountUsd: null });
  });
});

describe("generateStatements", () => {
  const orgFindMany = vi.fn();
  const usageFindMany = vi.fn();
  const stFindMany = vi.fn();
  const create = vi.fn();
  const updateMany = vi.fn();
  const findUnique = vi.fn();
  const prisma = {
    organization: { findMany: orgFindMany },
    messageUsageDaily: { findMany: usageFindMany },
    billingStatement: { findMany: stFindMany, create, updateMany },
    billingSetting: { findUnique },
  } as unknown as PrismaClient;
  const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const now = new Date("2026-11-14T00:50:00Z");
  // Registered on the 14th of various months: their cycle ends on 14 Nov. "other" registered on the 20th: nothing ends today.
  const created14 = new Date("2026-03-14T08:00:00Z");

  beforeEach(() => {
    [orgFindMany, usageFindMany, stFindMany, create, updateMany, findUnique].forEach((m) => m.mockReset());
    findUnique.mockResolvedValue(null);
    stFindMany.mockResolvedValue([]);
    orgFindMany.mockResolvedValue([
      { id: "new", createdAt: created14 },
      { id: "draft", createdAt: created14 },
      { id: "issued", createdAt: created14 },
      { id: "zero", createdAt: created14 },
      { id: "other", createdAt: new Date("2026-03-20T00:00:00Z") },
      { id: "joinedToday", createdAt: new Date("2026-11-14T03:00:00Z") },
    ]);
  });

  it("refuses a day that has not arrived or is not a UTC midnight", async () => {
    await expect(generateStatements(prisma, D("2026-11-15"), now)).rejects.toThrow("not arrived");
    await expect(generateStatements(prisma, new Date("2026-11-14T05:00:00Z"), now)).rejects.toThrow("midnight");
    expect(create).not.toHaveBeenCalled();
  });

  it("only prepares organizations whose own cycle ended that day, counting only that cycle's days", async () => {
    usageFindMany.mockResolvedValue([
      { organizationId: "new", day: D("2026-10-13"), billableCount: 9999 }, // before the cycle: must not count
      { organizationId: "new", day: D("2026-10-14"), billableCount: 1000 },
      { organizationId: "new", day: D("2026-11-13"), billableCount: 2240 },
      { organizationId: "draft", day: D("2026-11-01"), billableCount: 100 },
      { organizationId: "issued", day: D("2026-11-02"), billableCount: 900 },
      { organizationId: "other", day: D("2026-11-02"), billableCount: 5000 },
    ]);
    stFindMany.mockResolvedValue([
      { organizationId: "draft", month: "2026-10-14", status: "draft" },
      { organizationId: "issued", month: "2026-10-14", status: "issued" },
    ]);
    const res = await generateStatements(prisma, D("2026-11-14"), now);
    expect(res).toEqual({ created: 1, refreshed: 1, skipped: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({ organizationId: "new", month: "2026-10-14", messages: 3240, status: "draft", bandName: "Band 1", amountInr: 999 });
    expect(updateMany.mock.calls[0]![0].where).toEqual({ organizationId: "draft", month: "2026-10-14", status: "draft" });
    // "other" (anchor 20) and "joinedToday" (no finished cycle) are never queried
    expect(usageFindMany.mock.calls[0]![0].where.organizationId.in.sort()).toEqual(["draft", "issued", "new", "zero"]);
  });

  it("does nothing when no organization has a cycle ending that day", async () => {
    const res = await generateStatements(prisma, D("2026-11-15"), new Date("2026-11-15T01:00:00Z"));
    expect(res).toEqual({ created: 0, refreshed: 0, skipped: 0 });
    expect(usageFindMany).not.toHaveBeenCalled();
  });
});
