import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { deltaPct, getDashboardKpis } from "./dashboard-queries.js";
import { windowFor } from "./dashboard-range.js";

const mockPrisma = {
  conversation: { count: vi.fn(), findMany: vi.fn() },
  contact: { count: vi.fn() },
  message: { count: vi.fn(), groupBy: vi.fn() },
  campaign: { count: vi.fn(), findMany: vi.fn() },
  campaignRecipient: { groupBy: vi.fn() },
  template: { count: vi.fn() },
  $queryRaw: vi.fn(),
};
const prisma = mockPrisma as unknown as PrismaClient;
const w = windowFor("7d", "UTC", new Date("2026-10-10T00:00:00Z"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deltaPct", () => {
  it("handles null/zero previous and rounds to 1 decimal", () => {
    expect(deltaPct(10, 0)).toBeNull();
    expect(deltaPct(10, null)).toBeNull();
    expect(deltaPct(null, 10)).toBeNull();
    expect(deltaPct(15, 10)).toBe(50);
    expect(deltaPct(5, 10)).toBe(-50);
    expect(deltaPct(10, 3)).toBe(233.3);
  });
});

describe("getDashboardKpis", () => {
  it("scopes every count by org, live contacts and non-system messages", async () => {
    mockPrisma.conversation.count.mockResolvedValue(4);
    mockPrisma.contact.count.mockResolvedValue(3);
    mockPrisma.message.count.mockResolvedValue(10);
    mockPrisma.campaign.count.mockResolvedValue(1);
    mockPrisma.$queryRaw.mockResolvedValue([{ secs: 90 }]);
    await getDashboardKpis(prisma, "org-1", w);

    for (const [arg] of mockPrisma.conversation.count.mock.calls) {
      expect(arg.where.organizationId).toBe("org-1");
      expect(arg.where.contact).toEqual({ deletedAt: null });
    }
    for (const [arg] of mockPrisma.contact.count.mock.calls) {
      expect(arg.where.organizationId).toBe("org-1");
      expect(arg.where.deletedAt).toBeNull();
    }
    for (const [arg] of mockPrisma.message.count.mock.calls) {
      expect(arg.where.organizationId).toBe("org-1");
      expect(arg.where.isSystemMessage).toBe(false);
      expect(arg.where.conversation).toEqual({ contact: { deletedAt: null } });
    }
    for (const [arg] of mockPrisma.campaign.count.mock.calls) {
      expect(arg.where.organizationId).toBe("org-1");
      expect(arg.where.status).toBe("completed");
    }
    for (const call of mockPrisma.$queryRaw.mock.calls) {
      expect(call.slice(1)).toContain("org-1");
    }
    expect(mockPrisma.conversation.count.mock.calls[0][0].where.status).toBe("open");
  });

  it("computes values, previous and delta", async () => {
    mockPrisma.conversation.count.mockResolvedValueOnce(7); // open
    mockPrisma.conversation.count.mockResolvedValueOnce(20); // new cur
    mockPrisma.conversation.count.mockResolvedValueOnce(10); // new prev
    mockPrisma.contact.count.mockResolvedValue(5);
    mockPrisma.message.count.mockResolvedValue(8);
    mockPrisma.campaign.count.mockResolvedValue(2);
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ secs: 90.4 }]).mockResolvedValueOnce([{ secs: 180 }]);
    const k = await getDashboardKpis(prisma, "org-1", w);
    expect(k.openConversations.value).toBe(7);
    expect(k.newConversations).toEqual({ value: 20, previous: 10, deltaPct: 100 });
    expect(k.messages.inbound).toBe(8);
    expect(k.messages.outbound).toBe(8);
    expect(k.messages.value).toBe(16);
    expect(k.firstReplySecs).toEqual({ value: 90, previous: 180, deltaPct: -50 });
  });

  it("returns zeros and nulls (never NaN) for a brand new org", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.$queryRaw.mockResolvedValue([{ secs: null }]);
    const k = await getDashboardKpis(prisma, "org-1", w);
    expect(k.openConversations.value).toBe(0);
    expect(k.newConversations).toEqual({ value: 0, previous: 0, deltaPct: null });
    expect(k.messages.deltaPct).toBeNull();
    expect(k.firstReplySecs).toEqual({ value: null, previous: null, deltaPct: null });
    expect(k.campaignsSent.deltaPct).toBeNull();
  });

  it("returns null first reply when the query yields no rows", async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const k = await getDashboardKpis(prisma, "org-1", w);
    expect(k.firstReplySecs.value).toBeNull();
  });
});
