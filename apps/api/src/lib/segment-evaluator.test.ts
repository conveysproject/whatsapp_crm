import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// Mock prisma for unit tests
const mockFindMany = vi.fn();
const mockPrisma = {
  contact: { findMany: mockFindMany },
} as unknown as PrismaClient;

beforeEach(() => { vi.clearAllMocks(); });

describe("evaluateSegment", () => {
  it("returns count and contacts for lifecycleStage equals", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([
      { id: "c1", firstName: "Ravi", lastName: "Kumar", phoneNumber: "+919000000001", lifecycleStage: "lead" },
    ]);
    const result = await evaluateSegment(mockPrisma, "org-1", [
      { field: "lifecycleStage", operator: "equals", value: "lead" },
    ], "all");
    expect(result.count).toBe(1);
    expect(result.contacts[0].phoneNumber).toBe("+919000000001");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ lifecycleStage: "lead" }] }),
    }));
  });

  it("uses OR clause when match is any", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "lifecycleStage", operator: "equals", value: "lead" },
      { field: "tags", operator: "contains", value: "VIP" },
    ], "any");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });

  it("evaluates tags doesNotContain", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "tags", operator: "doesNotContain", value: "spam" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ NOT: { tags: { has: "spam" } } }] }),
    }));
  });

  it("evaluates whatsappOptOut isTrue", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "whatsappOptOut", operator: "isTrue" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ whatsappOptOut: true }] }),
    }));
  });

  it("evaluates createdAt between", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "createdAt", operator: "between", value: "2024-01-01", valueTo: "2024-12-31" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ createdAt: { gte: new Date("2024-01-01"), lte: new Date("2024-12-31") } }],
      }),
    }));
  });

  it("evaluates customField equals", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "customField", operator: "equals", customFieldId: "cf-1", value: "Gold" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ customFieldValues: { some: { fieldId: "cf-1", fieldValue: { equals: "Gold" } } } }],
      }),
    }));
  });

  it("returns empty contacts when no filters", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([
      { id: "c1", firstName: "A", lastName: null, phoneNumber: "+91900", lifecycleStage: null },
    ]);
    const result = await evaluateSegment(mockPrisma, "org-1", [], "all");
    expect(result.count).toBe(1);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1", deletedAt: null },
    }));
  });
});
