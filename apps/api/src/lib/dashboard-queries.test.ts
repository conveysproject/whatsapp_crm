import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { deltaPct, getDashboardKpis, getAttentionCounts, getCampaignFunnel, type AttentionKey } from "./dashboard-queries.js";
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

describe("getAttentionCounts", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("runs no queries when nothing is requested", async () => {
    const r = await getAttentionCounts(prisma, "org-1", now, new Set());
    expect(r).toEqual({ unanswered: 0, sla_at_risk: 0, failed_messages: 0, templates: 0 });
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.message.count).not.toHaveBeenCalled();
    expect(mockPrisma.template.count).not.toHaveBeenCalled();
  });

  it("unanswered: 60-minute threshold param, org scoped, bot excluded, outbound clears it", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ n: 3 }]);
    const r = await getAttentionCounts(prisma, "org-1", now, new Set<AttentionKey>(["unanswered"]));
    expect(r.unanswered).toBe(3);
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join("?");
    expect(values).toContain("org-1");
    const threshold = values.find((v) => v instanceof Date) as Date;
    expect(threshold.toISOString()).toBe("2026-10-10T11:00:00.000Z"); // 60 min before now: 59 min old is excluded, 61 min old is included
    expect(sql).toContain("c.status IN ('open','pending')");
    expect(sql).not.toContain("'bot'");
    expect(sql).toContain("ct.deleted_at IS NULL");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("m.direction = 'outbound'");
    expect(sql).toContain("m.is_system_message = false");
    expect(sql).toContain("m.created_at > c.last_inbound_at");
  });

  it("sla_at_risk: counts overdue conversations with no outbound, org scoped", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: "c1", createdAt: new Date(now.getTime() - 2 * 3600_000), sla: { firstResponseSecs: 3600 } }, // overdue
      { id: "c2", createdAt: new Date(now.getTime() - 2 * 3600_000), sla: { firstResponseSecs: 3600 } }, // has reply
      { id: "c3", createdAt: new Date(now.getTime() - 30 * 60_000), sla: { firstResponseSecs: 3600 } }, // not due yet
      { id: "c4", createdAt: new Date(now.getTime() - 2 * 3600_000), sla: null }, // defensive
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: "c2" }]);
    const r = await getAttentionCounts(prisma, "org-1", now, new Set<AttentionKey>(["sla_at_risk"]));
    expect(r.sla_at_risk).toBe(1);
    const where = mockPrisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org-1");
    expect(where.slaId).toEqual({ not: null });
    expect(where.status).toEqual({ in: ["open", "pending"] });
    expect(where.contact).toEqual({ deletedAt: null });
    const g = mockPrisma.message.groupBy.mock.calls[0][0];
    expect(g.where.organizationId).toBe("org-1");
    expect(g.where.direction).toBe("outbound");
    expect(g.where.isSystemMessage).toBe(false);
    expect(g.where.conversationId).toEqual({ in: ["c1", "c2", "c3", "c4"] });
  });

  it("sla_at_risk: skips the message query when no SLA conversations exist", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const r = await getAttentionCounts(prisma, "org-1", now, new Set<AttentionKey>(["sla_at_risk"]));
    expect(r.sla_at_risk).toBe(0);
    expect(mockPrisma.message.groupBy).not.toHaveBeenCalled();
  });

  it("failed_messages: outbound failed/expired/aborted in last 24h, non-system, org scoped", async () => {
    mockPrisma.message.count.mockResolvedValue(4);
    const r = await getAttentionCounts(prisma, "org-1", now, new Set<AttentionKey>(["failed_messages"]));
    expect(r.failed_messages).toBe(4);
    const where = mockPrisma.message.count.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org-1");
    expect(where.direction).toBe("outbound");
    expect(where.status).toEqual({ in: ["failed", "expired", "aborted"] });
    expect(where.isSystemMessage).toBe(false);
    expect((where.sentAt.gte as Date).toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect(where.conversation).toEqual({ contact: { deletedAt: null } });
  });

  it("templates: problem statuses only, org scoped", async () => {
    mockPrisma.template.count.mockResolvedValue(2);
    const r = await getAttentionCounts(prisma, "org-1", now, new Set<AttentionKey>(["templates"]));
    expect(r.templates).toBe(2);
    const where = mockPrisma.template.count.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org-1");
    expect(where.status).toEqual({ in: ["rejected", "paused", "flagged", "limit_exceeded", "disabled"] });
  });

  it("only queries the requested keys", async () => {
    mockPrisma.template.count.mockResolvedValue(1);
    await getAttentionCounts(prisma, "org-1", now, new Set<AttentionKey>(["templates"]));
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.message.count).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
  });
});

describe("getCampaignFunnel", () => {
  const camp = (id: string, day: number) => ({ id, name: `C${id}`, sentAt: new Date(Date.UTC(2026, 9, day)) });
  const grp = (campaignId: string, status: string, n: number) => ({ campaignId, status, _count: n });

  it("returns nulls when there are no completed campaigns", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    const r = await getCampaignFunnel(prisma, "org-1");
    expect(r).toEqual({ current: null, previous: null });
    expect(mockPrisma.campaignRecipient.groupBy).not.toHaveBeenCalled();
  });

  it("previous is null with a single campaign", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([camp("a", 9)]);
    mockPrisma.campaignRecipient.groupBy.mockResolvedValue([grp("a", "sent", 2)]);
    const r = await getCampaignFunnel(prisma, "org-1");
    expect(r.current?.id).toBe("a");
    expect(r.current?.sentAt).toBe("2026-10-09T00:00:00.000Z");
    expect(r.previous).toBeNull();
  });

  it("buckets recipient statuses cumulatively and scopes by org", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([camp("a", 9), camp("b", 2)]);
    mockPrisma.campaignRecipient.groupBy.mockResolvedValue([
      grp("a", "pending", 5), grp("a", "cancelled", 1),
      grp("a", "sent", 1), grp("a", "accepted", 2), grp("a", "delivered", 3), grp("a", "played", 1), grp("a", "read", 4),
      grp("a", "failed", 2), grp("a", "expired", 1),
      grp("b", "read", 2), grp("b", "failed", 1),
    ]);
    const r = await getCampaignFunnel(prisma, "org-1");
    expect(r.current).toMatchObject({ id: "a", name: "Ca", sent: 11, delivered: 8, read: 5, failed: 3 });
    expect(r.previous).toMatchObject({ id: "b", sent: 2, delivered: 2, read: 2, failed: 1 });

    const f = mockPrisma.campaign.findMany.mock.calls[0][0];
    expect(f.where).toMatchObject({ organizationId: "org-1", status: "completed" });
    expect(f.where.isArchived).toBeUndefined();
    expect(f.orderBy).toEqual([{ sentAt: "desc" }, { id: "desc" }]);
    expect(f.take).toBe(2);
    const g = mockPrisma.campaignRecipient.groupBy.mock.calls[0][0];
    expect(g.where.organizationId).toBe("org-1");
    expect(g.where.campaignId).toEqual({ in: ["a", "b"] });
  });
});
