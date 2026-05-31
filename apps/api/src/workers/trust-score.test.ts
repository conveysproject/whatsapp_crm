// apps/api/src/workers/trust-score.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn().mockResolvedValue({});
const mockFindFirst = vi.fn().mockResolvedValue(null); // no existing snapshot by default
const mockOrgFindMany = vi.fn().mockResolvedValue([{ id: "org-1" }]);
const mockMessageCount = vi.fn();
const mockContactCount = vi.fn();
const mockCampaignFindMany = vi.fn();

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: { findMany: mockOrgFindMany },
    message: { count: mockMessageCount },
    contact: { count: mockContactCount },
    campaign: { findMany: mockCampaignFindMany },
    orgTrustScoreSnapshot: { findFirst: mockFindFirst, create: mockCreate },
  },
}));

vi.mock("../lib/queue.js", () => ({
  redisConnection: {},
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    add: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation((_name: string, processor: () => Promise<void>) => ({
    on: vi.fn(),
    _processor: processor,
  })),
}));

describe("computeOrgScore", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("computes score as sum of 4 category scores", async () => {
    mockMessageCount
      .mockResolvedValueOnce(100)  // totalMessages (outbound)
      .mockResolvedValueOnce(80)   // deliveredMessages
      .mockResolvedValueOnce(15);  // inboundMessages
    mockContactCount
      .mockResolvedValueOnce(40)   // totalContacts
      .mockResolvedValueOnce(30);  // contactsWithTags
    mockCampaignFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);

    const { computeOrgScore } = await import("./trust-score.js");
    const result = await computeOrgScore("org-1");

    // deliveryScore = round(0.8 * 30) = 24
    // responseScore = round(0.15 * 25) = 4
    // contactScore  = round(0.75 * 25) = 19
    // campaignScore = min(20, 3*2) = 6
    // total = 53
    expect(result.score).toBe(53);
    expect(result.breakdown.deliveryScore).toBe(24);
    expect(result.breakdown.responseScore).toBe(4);
    expect(result.breakdown.contactScore).toBe(19);
    expect(result.breakdown.campaignScore).toBe(6);
  });

  it("returns zero score when org has no data", async () => {
    mockMessageCount.mockResolvedValue(0);
    mockContactCount.mockResolvedValue(0);
    mockCampaignFindMany.mockResolvedValue([]);

    const { computeOrgScore } = await import("./trust-score.js");
    const result = await computeOrgScore("org-empty");
    expect(result.score).toBe(0);
  });
});

describe("startTrustScoreWorker snapshot logic", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("writes a snapshot for an org that has no entry today", async () => {
    mockFindFirst.mockResolvedValue(null); // no existing snapshot
    mockMessageCount.mockResolvedValue(0);
    mockContactCount.mockResolvedValue(0);
    mockCampaignFindMany.mockResolvedValue([]);
    mockOrgFindMany.mockResolvedValue([{ id: "org-1" }]);

    const { startTrustScoreWorker } = await import("./trust-score.js");
    const worker = startTrustScoreWorker() as unknown as { _processor: () => Promise<void> };
    await worker._processor();

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-1", score: 0 }),
      })
    );
  });

  it("skips snapshot when one already exists for today", async () => {
    mockFindFirst.mockResolvedValue({ id: "snap-1" }); // already exists
    mockOrgFindMany.mockResolvedValue([{ id: "org-1" }]);

    const { startTrustScoreWorker } = await import("./trust-score.js");
    const worker = startTrustScoreWorker() as unknown as { _processor: () => Promise<void> };
    await worker._processor();

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
