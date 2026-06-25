import { describe, it, expect, vi, beforeEach } from "vitest";

// eslint-disable-next-line no-var
var _workerProcessor: ((job: { data: unknown }) => Promise<void>) | undefined;

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: { data: unknown }) => Promise<void>) => {
    _workerProcessor = processor;
    return { on: vi.fn() };
  }),
  Queue: vi.fn(),
}));
vi.mock("../lib/queue.js", () => ({
  redisConnection: {},
}));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    orgAutomationSettings: { findUnique: vi.fn() },
    message: { findFirst: vi.fn(), create: vi.fn() },
    conversation: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
}));
vi.mock("../lib/automation-trigger.js", () => ({
  isWithinBusinessHours: vi.fn(),
}));
vi.mock("../lib/whatsapp.js", () => ({
  sendTextMessage: vi.fn(),
}));
vi.mock("../lib/record-outbound.js", () => ({
  recordOutbound: vi.fn(),
}));

// Import the worker — this triggers the Worker constructor, setting _workerProcessor
import "./delayed-response.worker.js";

import { prisma } from "../lib/prisma.js";
import { isWithinBusinessHours } from "../lib/automation-trigger.js";
import { sendTextMessage } from "../lib/whatsapp.js";
import { recordOutbound } from "../lib/record-outbound.js";
import type { DelayedResponseJob } from "./delayed-response.worker.js";

const mockPrisma = prisma as unknown as {
  orgAutomationSettings: { findUnique: ReturnType<typeof vi.fn> };
  message: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  conversation: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  organization: { findUnique: ReturnType<typeof vi.fn> };
  contact: { findFirst: ReturnType<typeof vi.fn> };
};
const mockIsWithin = isWithinBusinessHours as ReturnType<typeof vi.fn>;
const mockSendText = sendTextMessage as ReturnType<typeof vi.fn>;
const mockRecordOutbound = recordOutbound as ReturnType<typeof vi.fn>;

const BASE_SETTINGS = {
  delayedEnabled: true,
  delayedMessage: "Sorry for the wait, {{first_name}}!",
  delayedMinutes: 30,
  delayedSendWithOoo: false,
};
const BASE_CONVERSATION = { id: "conv-1", status: "open", whatsappContactId: "447000000000" };
const BASE_ORG = { phoneNumberId: "pn-1", wabaAccessToken: "tok-1" };
const BASE_CONTACT = { firstName: "Alice", lastName: "Smith", phoneNumber: "447000000000", email: null };
const JOB_DATA: DelayedResponseJob = {
  conversationId: "conv-1",
  organizationId: "org-1",
  scheduledAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
};

async function runProcessor(data: DelayedResponseJob = JOB_DATA): Promise<void> {
  if (!_workerProcessor) throw new Error("Worker processor was not captured");
  return _workerProcessor({ data });
}

describe("delayed-response worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue(BASE_SETTINGS);
    mockPrisma.message.findFirst.mockResolvedValue(null); // no outbound since scheduled
    mockPrisma.conversation.findUnique.mockResolvedValue(BASE_CONVERSATION);
    mockPrisma.conversation.findFirst.mockResolvedValue(BASE_CONVERSATION);
    mockIsWithin.mockResolvedValue(true); // within business hours
    mockPrisma.organization.findUnique.mockResolvedValue(BASE_ORG);
    mockPrisma.contact.findFirst.mockResolvedValue(BASE_CONTACT);
    mockSendText.mockResolvedValue({ messageId: "wamid-1" });
    mockRecordOutbound.mockResolvedValue(undefined);
  });

  it("sends message when no agent replied and within hours", async () => {
    await runProcessor();
    expect(mockSendText).toHaveBeenCalledWith(
      "pn-1",
      "447000000000",
      "Sorry for the wait, Alice!",
      "tok-1"
    );
    expect(mockRecordOutbound).toHaveBeenCalledTimes(1);
  });

  it("skips when last message is outbound (agent already replied)", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: "m-1", direction: "outbound" });
    await runProcessor();
    expect(mockPrisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
        }),
      })
    );
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("skips when delayedEnabled is false", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      delayedEnabled: false,
    });
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("skips when outside hours and delayedSendWithOoo is false", async () => {
    mockIsWithin.mockResolvedValue(false);
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("sends when outside hours and delayedSendWithOoo is true", async () => {
    mockIsWithin.mockResolvedValue(false);
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      delayedSendWithOoo: true,
    });
    await runProcessor();
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("skips when conversation is not open", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...BASE_CONVERSATION, status: "resolved" });
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });
});
