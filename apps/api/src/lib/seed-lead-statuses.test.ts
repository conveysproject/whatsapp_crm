import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedLeadStatuses, SEED_LEAD_STATUSES } from "./seed-lead-statuses.js";

const mockPrisma = {
  leadStatus: { count: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  organization: { findUnique: vi.fn(), update: vi.fn() },
};

beforeEach(() => { vi.clearAllMocks(); });

describe("seedLeadStatuses", () => {
  it("inserts the 7 default statuses for a fresh org", async () => {
    mockPrisma.leadStatus.count.mockResolvedValue(0);
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "won-1" }, { id: "lost-1" }]);
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    mockPrisma.organization.update.mockResolvedValue({});
    await seedLeadStatuses(mockPrisma as unknown as PrismaClient, "org-1");
    expect(mockPrisma.leadStatus.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.leadStatus.createMany.mock.calls[0]![0] as { data: unknown[] };
    expect(arg.data).toHaveLength(7);
    expect(arg.data[0]).toEqual({ organizationId: "org-1", name: "New Lead", color: "#F97316", sortOrder: 0 });
    expect(arg.data[6]).toEqual({ organizationId: "org-1", name: "Closed Lost", color: "#EF4444", sortOrder: 6 });
    expect(arg.data[0]).not.toHaveProperty("isClosure");
  });

  it("writes closureLeadStatusIds for Closed Won and Closed Lost", async () => {
    mockPrisma.leadStatus.count.mockResolvedValue(0);
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "won-1" }, { id: "lost-1" }]);
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: { contactConfig: { defaultLeadStatusId: "nl-1" } } });
    mockPrisma.organization.update.mockResolvedValue({});
    await seedLeadStatuses(mockPrisma as unknown as PrismaClient, "org-1");
    const updateArg = mockPrisma.organization.update.mock.calls[0]![0] as {
      data: { settings: { contactConfig: { closureLeadStatusIds: string[]; defaultLeadStatusId: string } } };
    };
    expect(updateArg.data.settings.contactConfig.closureLeadStatusIds).toEqual(["won-1", "lost-1"]);
    expect(updateArg.data.settings.contactConfig.defaultLeadStatusId).toBe("nl-1");
  });

  it("is idempotent — skips when statuses already exist", async () => {
    mockPrisma.leadStatus.count.mockResolvedValue(7);
    await seedLeadStatuses(mockPrisma as unknown as PrismaClient, "org-1");
    expect(mockPrisma.leadStatus.createMany).not.toHaveBeenCalled();
  });

  it("SEED_LEAD_STATUSES has the 7 expected names in order", () => {
    expect(SEED_LEAD_STATUSES.map((s) => s.name)).toEqual([
      "New Lead", "Qualification", "Needs Analysis", "Proposal", "Negotiation", "Closed Won", "Closed Lost",
    ]);
    expect(SEED_LEAD_STATUSES[0]).not.toHaveProperty("isClosure");
  });
});
