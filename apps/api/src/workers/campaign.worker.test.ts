import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, wa, recordOutbound, workerCtor } = vi.hoisted(() => ({
  prisma: {
    campaign: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    campaignGroup: { findMany: vi.fn() },
    groupContact: { findMany: vi.fn() },
    contact: { findMany: vi.fn(), findFirst: vi.fn() },
    campaignRecipient: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    template: { findUnique: vi.fn() },
    contactEvent: { create: vi.fn() },
    segment: { findFirst: vi.fn() },
  },
  wa: { sendTextMessage: vi.fn(), sendTemplateMessage: vi.fn() },
  recordOutbound: vi.fn(),
  workerCtor: vi.fn(),
}));
vi.mock("bullmq", () => {
  class Worker { constructor(...a: unknown[]) { workerCtor(...a); } }
  return { Worker };
});
vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/io-ref.js", () => ({ getIo: () => null }));
vi.mock("../lib/whatsapp.js", () => wa);
vi.mock("../lib/record-outbound.js", () => ({ recordOutbound }));
vi.mock("../lib/segment-evaluator.js", () => ({ evaluateSegment: vi.fn() }));

import { BillingBlockedError } from "../lib/billing/send-guard.js";
import "./campaign.worker.js";

type Processor = (job: { data: { campaignId: string; organizationId: string } }) => Promise<void>;
const processor = workerCtor.mock.calls[0]![1] as Processor;
const run = () => processor({ data: { campaignId: "camp-1", organizationId: "org-1" } });

const baseCampaign = { id: "camp-1", name: "Promo", messageInterval: 0, expiresAt: null, mediaUrl: null, cardMediaUrls: null, segments: [] };

describe("campaign worker recordOutbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    prisma.campaign.update.mockResolvedValue({});
    prisma.campaign.findUnique.mockResolvedValue({ status: "running" });
    prisma.campaignGroup.findMany.mockResolvedValue([]);
    prisma.contact.findMany.mockResolvedValue([{ phoneNumber: "919999999999" }]);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.campaignRecipient.findFirst.mockResolvedValue({ id: "r1", status: "pending", retries: 0, fullName: null, contactId: null });
    prisma.campaignRecipient.update.mockResolvedValue({});
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", status: "open" });
    wa.sendTextMessage.mockResolvedValue({ messageId: "wamid-text" });
    wa.sendTemplateMessage.mockResolvedValue({ messageId: "wamid-tpl" });
  });

  it("passes templateId and source=campaign for a template campaign", async () => {
    prisma.campaign.findFirst.mockResolvedValue({ ...baseCampaign, campaignType: "template", templateId: "tpl-1" });
    prisma.template.findUnique.mockResolvedValue({
      name: "promo", language: "en_US", metaTemplateId: "meta-1", components: [{ type: "BODY", text: "Hello" }],
    });
    await run();
    expect(recordOutbound).toHaveBeenCalledTimes(1);
    expect(recordOutbound).toHaveBeenCalledWith(prisma, expect.objectContaining({
      contentType: "template", whatsappMessageId: "wamid-tpl", templateId: "tpl-1", source: "campaign",
    }));
  });

  it("passes neither templateId nor source for a text campaign", async () => {
    prisma.campaign.findFirst.mockResolvedValue({ ...baseCampaign, campaignType: "text", templateId: "Hi there" });
    await run();
    expect(recordOutbound).toHaveBeenCalledTimes(1);
    const args = recordOutbound.mock.calls[0]![1] as Record<string, unknown>;
    expect(args.contentType).toBe("text");
    expect(args).not.toHaveProperty("templateId");
    expect(args).not.toHaveProperty("source");
  });
});

describe("campaign worker when sending is paused for non-payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    prisma.campaign.update.mockResolvedValue({});
    prisma.campaign.findUnique.mockResolvedValue({ status: "running" });
    prisma.campaignGroup.findMany.mockResolvedValue([]);
    prisma.contact.findMany.mockResolvedValue([{ phoneNumber: "911" }, { phoneNumber: "912" }, { phoneNumber: "913" }]);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.campaignRecipient.findFirst.mockResolvedValue({ id: "r1", status: "pending", retries: 0, fullName: null, contactId: null });
    prisma.campaignRecipient.update.mockResolvedValue({});
    prisma.campaignRecipient.findMany.mockResolvedValue([{ phoneNumber: "912" }]);
    prisma.campaignRecipient.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignRecipient.createMany.mockResolvedValue({ count: 1 });
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", status: "open" });
    prisma.campaign.findFirst.mockResolvedValue({ ...baseCampaign, campaignType: "text", templateId: "Hi there" });
    wa.sendTextMessage.mockRejectedValue(new BillingBlockedError("org-1", new Date()));
  });

  it("stops at the first refusal, fails everyone still waiting with the reason, and sends nothing more", async () => {
    await run();
    expect(wa.sendTextMessage).toHaveBeenCalledTimes(1);
    const msg = "Sending is paused because a WBMSG statement is overdue";
    expect(prisma.campaignRecipient.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1" }, data: expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining(msg) }) }));
    // phones 912 and 913 had not been sent: 912 already has a row (marked failed), 913 gets a failed row
    expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ campaignId: "camp-1", phoneNumber: { in: ["912", "913"] }, status: "pending" }), data: expect.objectContaining({ status: "failed" }) }));
    const created = prisma.campaignRecipient.createMany.mock.calls[0]![0] as { data: Array<{ phoneNumber: string; status: string; errorMessage: string }> };
    expect(created.data.map((d) => d.phoneNumber)).toEqual(["913"]);
    expect(created.data[0]).toMatchObject({ status: "failed", errorMessage: expect.stringContaining(msg) });
    expect(recordOutbound).not.toHaveBeenCalled();
  });
});
