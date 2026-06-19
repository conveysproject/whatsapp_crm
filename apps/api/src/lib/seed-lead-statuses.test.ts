import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedLeadStatuses, SEED_LEAD_STATUSES } from "./seed-lead-statuses.js";

const mockPrisma = {
  leadStatus: { count: vi.fn(), createMany: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedLeadStatuses", () => {
  it("inserts the 7 default statuses for a fresh org", async () => {
    mockPrisma.leadStatus.count.mockResolvedValue(0);
    await seedLeadStatuses(mockPrisma as unknown as PrismaClient, "org-1");
    expect(mockPrisma.leadStatus.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.leadStatus.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(7);
    expect(arg.data[0]).toEqual({ organizationId: "org-1", name: "New Lead", color: "#F97316", sortOrder: 0, isClosure: false });
    expect(arg.data[6]).toEqual({ organizationId: "org-1", name: "Closed Lost", color: "#EF4444", sortOrder: 6, isClosure: true });
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
  });
});
