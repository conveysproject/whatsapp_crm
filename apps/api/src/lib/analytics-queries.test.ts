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

describe("getOverviewMetrics with days param", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("uses the provided days window for avgFirstResponseTime calculation", async () => {
    mockPrisma.conversation.count
      .mockResolvedValueOnce(3)   // open
      .mockResolvedValueOnce(1);  // bot
    mockPrisma.contact.count.mockResolvedValue(50);
    mockPrisma.message.count.mockResolvedValue(10);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.campaign.count.mockResolvedValue(1);
    // outbound messages and convs produce a calculable avg
    const now = new Date();
    const convCreated = new Date(now.getTime() - 300_000); // 5 min ago
    const firstReply = new Date(now.getTime() - 240_000);  // 4 min ago (60s response)
    mockPrisma.message.findMany.mockResolvedValue([
      { conversationId: "c1", createdAt: firstReply },
    ]);
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: "c1", createdAt: convCreated },
    ]);

    const { getOverviewMetrics } = await import("./analytics-queries.js");
    const result = await getOverviewMetrics(mockPrisma as unknown as PrismaClient, "org-1", 7);

    expect(result.avgFirstResponseTime).toBe(60);
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

describe("getTeamStats", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns per-agent stats with openConversations, resolvedToday, slaBreaches", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user-1", fullName: "Anil Kumar" },
      { id: "user-2", fullName: "Priya Mehta" },
    ]);
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([
        { assignedTo: "user-1", slaId: null, sla: null, createdAt: new Date() },
        { assignedTo: "user-1", slaId: null, sla: null, createdAt: new Date() },
      ])                         // open convs
      .mockResolvedValueOnce([
        { assignedTo: "user-1" },
      ])                         // resolvedToday
      .mockResolvedValueOnce([]); // convs30d

    mockPrisma.message.findMany.mockResolvedValue([]); // firstOutbounds

    const { getTeamStats } = await import("./analytics-queries.js");
    const result = await getTeamStats(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result).toHaveLength(2);
    const anil = result.find((r) => r.userId === "user-1");
    expect(anil?.displayName).toBe("Anil Kumar");
    expect(anil?.openConversations).toBe(2);
    expect(anil?.resolvedToday).toBe(1);
    expect(anil?.slaBreaches).toBe(0);
    expect(anil?.avgFirstResponseSecs).toBe(0);
  });
});

describe("getCampaignSnapshot", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns last campaign with delivery counts and next scheduled campaign", async () => {
    const sentAt = new Date("2026-05-27T10:00:00Z");
    const scheduledAt = new Date("2026-06-01T09:00:00Z");

    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce({ id: "camp-1", name: "May Offer", sentAt })
      .mockResolvedValueOnce({ id: "camp-2", name: "June Launch", scheduledAt, _count: { recipients: 150 } });

    mockPrisma.campaignRecipient.groupBy.mockResolvedValue([
      { status: "delivered", _count: { _all: 80 } },
      { status: "read", _count: { _all: 40 } },
      { status: "failed", _count: { _all: 5 } },
      { status: "sent", _count: { _all: 25 } },
    ]);

    const { getCampaignSnapshot } = await import("./analytics-queries.js");
    const result = await getCampaignSnapshot(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result.lastCampaign?.id).toBe("camp-1");
    expect(result.lastCampaign?.totalSent).toBe(150);
    expect(result.lastCampaign?.delivered).toBe(120); // delivered + read
    expect(result.lastCampaign?.read).toBe(40);
    expect(result.lastCampaign?.failed).toBe(5);
    expect(result.nextScheduled?.id).toBe("camp-2");
    expect(result.nextScheduled?.recipientCount).toBe(150);
  });

  it("returns nulls when no campaigns exist", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    const { getCampaignSnapshot } = await import("./analytics-queries.js");
    const result = await getCampaignSnapshot(mockPrisma as unknown as PrismaClient, "org-1");
    expect(result.lastCampaign).toBeNull();
    expect(result.nextScheduled).toBeNull();
  });

  it("returns nextScheduled even when no last campaign exists", async () => {
    const scheduledAt = new Date("2026-06-01T09:00:00Z");
    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce(null)  // no completed campaign
      .mockResolvedValueOnce({ id: "camp-2", name: "June Launch", scheduledAt, _count: { recipients: 50 } });

    const { getCampaignSnapshot } = await import("./analytics-queries.js");
    const result = await getCampaignSnapshot(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result.lastCampaign).toBeNull();
    expect(result.nextScheduled?.id).toBe("camp-2");
    expect(result.nextScheduled?.recipientCount).toBe(50);
  });
});

describe("getActivityFeed", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("merges events from contacts, campaigns, conversations and users, sorted by time desc", async () => {
    const t1 = new Date("2026-05-28T09:00:00Z");
    const t2 = new Date("2026-05-28T08:00:00Z");
    const t3 = new Date("2026-05-28T07:00:00Z");
    const t4 = new Date("2026-05-28T06:00:00Z");

    mockPrisma.contact.findMany.mockResolvedValue([
      { name: "Rahul Sharma", firstName: null, lastName: null, createdAt: t1 },
    ]);
    mockPrisma.campaign.findMany.mockResolvedValue([
      { name: "May Offer", sentAt: t2 },
    ]);
    mockPrisma.conversation.findMany.mockResolvedValue([
      { contact: { name: "Priya Mehta", firstName: null }, closedAt: t3 },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { fullName: "Sandeep Joshi", createdAt: t4 },
    ]);

    const { getActivityFeed } = await import("./analytics-queries.js");
    const result = await getActivityFeed(mockPrisma as unknown as PrismaClient, "org-1");

    expect(result).toHaveLength(4);
    expect(result[0]!.type).toBe("contact_created");
    expect(result[0]!.label).toContain("Rahul Sharma");
    expect(result[1]!.type).toBe("campaign_sent");
    expect(result[2]!.type).toBe("conversation_closed");
    expect(result[3]!.type).toBe("member_joined");
  });

  it("returns empty array when no events", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { getActivityFeed } = await import("./analytics-queries.js");
    const result = await getActivityFeed(mockPrisma as unknown as PrismaClient, "org-1");
    expect(result).toHaveLength(0);
  });
});

describe("getAgentDetail", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns resolved count, sla breaches, avg response, and top conversations", async () => {
    const now = new Date();
    const convCreated = new Date(now.getTime() - 120_000); // 2 min ago

    mockPrisma.conversation.count.mockResolvedValue(3); // resolvedCount
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([
        {
          id: "c1",
          createdAt: convCreated,
          slaId: null,
          sla: null,
          status: "open",
          lastMessageAt: now,
          contact: { name: "Rahul Sharma", firstName: null, lastName: null },
        },
      ])   // openConvs
      .mockResolvedValueOnce([
        { id: "c1", createdAt: convCreated },
      ]);  // convsSince

    mockPrisma.message.findMany
      .mockResolvedValueOnce([]) // firstOutbounds (no response time)
      .mockResolvedValueOnce([
        { conversationId: "c1", body: "Need help", contentType: "text", createdAt: now },
      ]); // lastMessages

    const { getAgentDetail } = await import("./analytics-queries.js");
    const result = await getAgentDetail(mockPrisma as unknown as PrismaClient, "org-1", "user-1", 30);

    expect(result.resolvedCount).toBe(3);
    expect(result.slaBreaches).toBe(0);
    expect(result.avgFirstResponseSecs).toBe(0);
    expect(result.topConversations).toHaveLength(1);
    expect(result.topConversations[0]!.contactName).toBe("Rahul Sharma");
    expect(result.topConversations[0]!.lastMessagePreview).toBe("Need help");
    expect(result.topConversations[0]!.status).toBe("open");
  });
});
