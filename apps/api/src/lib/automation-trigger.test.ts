import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Module-level mocks for runAutomationTrigger dependencies
// (vi.mock calls are hoisted by Vitest, so they apply before any imports)
// ---------------------------------------------------------------------------

vi.mock("./queue.js", () => ({
  delayedResponseQueue: {
    getJob: vi.fn(),
    add: vi.fn(),
  },
}));

vi.mock("./whatsapp.js", () => ({
  sendTextMessage: vi.fn(),
}));

vi.mock("./record-outbound.js", () => ({
  recordOutbound: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { delayedResponseQueue } from "./queue.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";

// ---------------------------------------------------------------------------
// isWithinBusinessHours tests
// (kept using dynamic import pattern so vi.resetModules() doesn't break mocks
// for the second suite — we use isolated prisma mocks here)
// ---------------------------------------------------------------------------

// We only need the two Prisma models this helper touches
const mockPrismaHours = {
  organization: { findUnique: vi.fn() },
  businessHours: { findMany: vi.fn() },
};

// Dynamic import so mocks are in place before the module loads
async function getIsWithinBusinessHours() {
  const { isWithinBusinessHours } = await import("./automation-trigger.js");
  return isWithinBusinessHours;
}

describe("isWithinBusinessHours", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrismaHours.organization.findUnique.mockResolvedValue({ settings: {} }); // UTC
  });

  it("returns true when `now` falls inside a slot (UTC Mon 10:00)", async () => {
    // 2026-06-22 is a Monday
    const now = new Date("2026-06-22T10:00:00.000Z"); // Mon 10:00 UTC
    mockPrismaHours.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getIsWithinBusinessHours();
    const result = await fn(mockPrismaHours as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(true);
  });

  it("returns false when `now` is before slot start (UTC Mon 08:59)", async () => {
    const now = new Date("2026-06-22T08:59:00.000Z");
    mockPrismaHours.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getIsWithinBusinessHours();
    const result = await fn(mockPrismaHours as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when `now` is after slot end (UTC Mon 18:00 exactly)", async () => {
    const now = new Date("2026-06-22T18:00:00.000Z");
    mockPrismaHours.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getIsWithinBusinessHours();
    const result = await fn(mockPrismaHours as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when no slots are configured", async () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    mockPrismaHours.businessHours.findMany.mockResolvedValue([]);
    const fn = await getIsWithinBusinessHours();
    const result = await fn(mockPrismaHours as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when now is on a day with no slot configured (Saturday)", async () => {
    const now = new Date("2026-06-20T10:00:00.000Z"); // Sat 10:00 UTC
    mockPrismaHours.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }, // Mon only
    ]);
    const fn = await getIsWithinBusinessHours();
    const result = await fn(mockPrismaHours as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns true for second slot in a split-shift day", async () => {
    const now = new Date("2026-06-22T14:00:00.000Z"); // Mon 14:00
    mockPrismaHours.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "13:00", endTime: "18:00" },
    ]);
    const fn = await getIsWithinBusinessHours();
    const result = await fn(mockPrismaHours as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runAutomationTrigger tests
// ---------------------------------------------------------------------------

import { runAutomationTrigger } from "./automation-trigger.js";

const mockQueue = delayedResponseQueue as unknown as {
  getJob: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
};
const mockSendText = sendTextMessage as ReturnType<typeof vi.fn>;
const mockRecordOutbound = recordOutbound as ReturnType<typeof vi.fn>;

// Prisma mock used by runAutomationTrigger
const mockPrisma = {
  orgAutomationSettings: { findUnique: vi.fn() },
  message: { findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
  businessHours: { findMany: vi.fn() },
  flow: { findFirst: vi.fn() },
};

const BASE_ORG_CREDS = { phoneNumberId: "pn-1", wabaAccessToken: "tok-1" };
const BASE_CONTACT = {
  id: "contact-1",
  firstName: "Alice",
  lastName: "Smith",
  phoneNumber: "447000000000",
  email: "alice@example.com",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  lastMessageAt: null,
};
const BASE_CONVERSATION = {
  id: "conv-1",
  status: "open",
  lastInboundAt: null,
};
const NOW = new Date("2026-06-22T10:00:00.000Z"); // Mon 10:00 UTC (within default Mon 09-18 slot)

const BASE_SETTINGS = {
  welcomeEnabled: false,
  welcomeMessage: "Hello!",
  welcomeNewMessage: "Welcome new customer!",
  welcomeReturningMessage: "Welcome back!",
  welcomePersonalized: false,
  welcomeFlowId: null,
  oooEnabled: false,
  oooMessage: "We are out of office.",
  delayedEnabled: false,
  delayedMessage: "We'll get back to you shortly.",
  delayedMinutes: 30,
  delayedSendWithOoo: false,
};

describe("runAutomationTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: settings exist but all features off
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({ ...BASE_SETTINGS });
    // No prior inbound messages — first contact
    mockPrisma.message.findFirst.mockResolvedValue(null);
    // Business hours: UTC org, Mon 09:00-18:00 → NOW is inside hours
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    // No flow
    mockPrisma.flow.findFirst.mockResolvedValue(null);

    // Queue: no existing job
    mockQueue.getJob.mockResolvedValue(null);
    mockQueue.add.mockResolvedValue({ id: "job-1" });

    // WhatsApp send
    mockSendText.mockResolvedValue({ messageId: "wamid-1" });
    mockRecordOutbound.mockResolvedValue(undefined);
  });

  // ── Welcome ──────────────────────────────────────────────────────────────

  it("sends welcome message on first inbound (no prior messages)", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      welcomeEnabled: true,
    });
    // No prior inbound message
    mockPrisma.message.findFirst.mockResolvedValue(null);

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      BASE_CONVERSATION,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).toHaveBeenCalledWith(
      "pn-1",
      "447000000000",
      "Hello!",
      "tok-1"
    );
    expect(mockRecordOutbound).toHaveBeenCalledTimes(1);
  });

  it("does NOT send welcome when contact has a recent message (< 24h ago)", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      welcomeEnabled: true,
    });
    // There is a prior inbound message
    mockPrisma.message.findFirst.mockResolvedValue({ id: "msg-old" });
    // Last inbound was only 1 h ago — NOT returning
    const conversation = {
      ...BASE_CONVERSATION,
      lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    };

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      conversation,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("sends returning-customer welcome when last inbound > 24h ago (personalized off)", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      welcomeEnabled: true,
      welcomePersonalized: false,
      welcomeMessage: "Good to hear from you again!",
    });
    mockPrisma.message.findFirst.mockResolvedValue({ id: "msg-old" });
    const conversation = {
      ...BASE_CONVERSATION,
      lastInboundAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), // 25h ago
    };

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      conversation,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).toHaveBeenCalledWith(
      "pn-1",
      "447000000000",
      "Good to hear from you again!",
      "tok-1"
    );
  });

  it("sends personalized new-customer welcome on first message", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      welcomeEnabled: true,
      welcomePersonalized: true,
      welcomeNewMessage: "Hi {{first_name}}, welcome!",
    });
    mockPrisma.message.findFirst.mockResolvedValue(null); // first message

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      BASE_CONVERSATION,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).toHaveBeenCalledWith(
      "pn-1",
      "447000000000",
      "Hi Alice, welcome!",
      "tok-1"
    );
  });

  // ── OOO ──────────────────────────────────────────────────────────────────

  it("sends OOO when outside hours + oooEnabled + conversation not open", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      oooEnabled: true,
      oooMessage: "We are closed.",
    });
    // Outside hours: no business hours slots
    mockPrisma.businessHours.findMany.mockResolvedValue([]);

    const conversation = { ...BASE_CONVERSATION, status: "pending" };

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      conversation,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).toHaveBeenCalledWith(
      "pn-1",
      "447000000000",
      "We are closed.",
      "tok-1"
    );
    expect(mockRecordOutbound).toHaveBeenCalledTimes(1);
  });

  it("does NOT send OOO when conversation is open", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      oooEnabled: true,
      oooMessage: "We are closed.",
    });
    // Outside hours
    mockPrisma.businessHours.findMany.mockResolvedValue([]);

    // status = "open" → skip OOO
    const conversation = { ...BASE_CONVERSATION, status: "open" };

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      conversation,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("does NOT send OOO when inside business hours", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      oooEnabled: true,
      oooMessage: "We are closed.",
    });
    // Inside hours: Mon 09:00-18:00 and NOW is Mon 10:00
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);

    const conversation = { ...BASE_CONVERSATION, status: "pending" };

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      conversation,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockSendText).not.toHaveBeenCalled();
  });

  // ── Delayed Response ──────────────────────────────────────────────────────

  it("enqueues delayed job when inside hours + delayedEnabled = true", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      delayedEnabled: true,
      delayedMinutes: 30,
    });
    // Inside hours
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      BASE_CONVERSATION,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      "fire",
      expect.objectContaining({
        conversationId: "conv-1",
        organizationId: "org-1",
      }),
      expect.objectContaining({
        jobId: "delayed-response:conv-1",
        delay: 30 * 60 * 1000,
      })
    );
  });

  it("does NOT enqueue delayed job when delayedEnabled = false", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      delayedEnabled: false,
    });
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      BASE_CONVERSATION,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("does NOT enqueue delayed job when outside hours and delayedSendWithOoo = false", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      delayedEnabled: true,
      delayedSendWithOoo: false,
    });
    // Outside hours
    mockPrisma.businessHours.findMany.mockResolvedValue([]);

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      BASE_CONVERSATION,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("enqueues delayed job outside hours when delayedSendWithOoo = true", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue({
      ...BASE_SETTINGS,
      delayedEnabled: true,
      delayedMinutes: 15,
      delayedSendWithOoo: true,
    });
    // Outside hours
    mockPrisma.businessHours.findMany.mockResolvedValue([]);

    await runAutomationTrigger(
      mockPrisma as unknown as PrismaClient,
      "org-1",
      BASE_CONVERSATION,
      BASE_CONTACT,
      BASE_ORG_CREDS,
      NOW
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      "fire",
      expect.objectContaining({ conversationId: "conv-1" }),
      expect.objectContaining({ delay: 15 * 60 * 1000 })
    );
  });

  // ── No settings ──────────────────────────────────────────────────────────

  it("returns early without error when no automation settings exist", async () => {
    mockPrisma.orgAutomationSettings.findUnique.mockResolvedValue(null);

    await expect(
      runAutomationTrigger(
        mockPrisma as unknown as PrismaClient,
        "org-1",
        BASE_CONVERSATION,
        BASE_CONTACT,
        BASE_ORG_CREDS,
        NOW
      )
    ).resolves.toBeUndefined();

    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
