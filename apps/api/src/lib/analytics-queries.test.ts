import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("./prisma.js", () => ({ prisma: {} }));

const mockPrisma = {
  conversation: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  contact: { count: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  invitation: { count: vi.fn() },
  campaign: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  campaignRecipient: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
};

describe("getOverviewMetrics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 7 metrics including the 3 new fields", async () => {
    mockPrisma.conversation.count
      .mockResolvedValueOnce(5)   // openConversations
      .mockResolvedValueOnce(2);  // botConversations
    mockPrisma.contact.count.mockResolvedValue(100);
    mockPrisma.message.count.mockResolvedValue(30);
    mockPrisma.invitation.count.mockResolvedValue(1);
    mockPrisma.campaign.count.mockResolvedValue(3);
    mockPrisma.message.findMany.mockResolvedValue([]); // no outbound msgs → avgFirstResponseTime = 0
    mockPrisma.conversation.findMany.mockResolvedValue([]); // no convs → avgFirstResponseTime = 0

    const { getOverviewMetrics } = await import("./analytics-queries.js");
    const result = await getOverviewMetrics(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result.openConversations).toBe(5);
    expect(result.totalContacts).toBe(100);
    expect(result.messagesToday).toBe(30);
    expect(result.pendingInvitations).toBe(1);
    expect(result.campaignsSentThisMonth).toBe(3);
    expect(result.avgFirstResponseTime).toBe(0);
    expect(result.botConversations).toBe(2);
  });
});

describe("getMyWork", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns assigned counts, performance stats and top 3 conversations", async () => {
    const now = new Date();
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([
        {
          id: "conv-1",
          unreadCount: 3,
          lastMessageAt: now,
          createdAt: new Date(now.getTime() - 600_000),
          slaId: null,
          sla: null,
          contact: { name: "Priya Singh", firstName: null, lastName: null },
        },
      ])
      .mockResolvedValueOnce([]); // convs30d
    mockPrisma.contact.count.mockResolvedValue(5);
    mockPrisma.conversation.count.mockResolvedValue(2); // resolvedToday
    mockPrisma.message.findMany
      .mockResolvedValueOnce([{ conversationId: "conv-1", body: "Hello there", contentType: "text", createdAt: now }])  // last messages
      .mockResolvedValueOnce([]); // firstOutbounds

    const { getMyWork } = await import("./analytics-queries.js");
    const result = await getMyWork(mockPrisma as unknown as PrismaClient, "org-1", "user-1");

    expect(result.assignedOpen).toBe(1);
    expect(result.unreadCount).toBe(3);
    expect(result.assignedContacts).toBe(5);
    expect(result.resolvedToday).toBe(2);
    expect(result.avgFirstResponseSecs).toBe(0);
    expect(result.slaBreaches).toBe(0);
    expect(result.topConversations).toHaveLength(1);
    expect(result.topConversations[0]!.contactName).toBe("Priya Singh");
    expect(result.topConversations[0]!.lastMessagePreview).toBe("Hello there");
  });
});
