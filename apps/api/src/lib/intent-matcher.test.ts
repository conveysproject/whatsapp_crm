import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("./claude.js", () => ({
  matchIntentToAutomation: vi.fn(),
}));
vi.mock("./whatsapp.js", () => ({
  sendTextMessage: vi.fn(),
}));
vi.mock("./record-outbound.js", () => ({
  recordOutbound: vi.fn(),
}));
vi.mock("./flow-runner.js", () => ({
  runFlow: vi.fn(),
}));

import { matchIntentToAutomation } from "./claude.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";
import { runFlow } from "./flow-runner.js";
import { runIntentMatching } from "./intent-matcher.js";

const mockMatchIntentToAutomation = vi.mocked(matchIntentToAutomation);
const mockSendTextMessage = vi.mocked(sendTextMessage);
const mockRecordOutbound = vi.mocked(recordOutbound);
const mockRunFlow = vi.mocked(runFlow);

const ORG = { phoneNumberId: "ph-1", wabaAccessToken: "tok-1" };
const ORG_ID = "org-1";
const CONV_ID = "conv-1";
const PHONE = "+911234567890";
const BODY = "I want to track my order";

function makePrisma(overrides?: {
  settings?: object | null;
  autoReplies?: object[];
  flows?: object[];
  contact?: object | null;
  flow?: object | null;
}): PrismaClient {
  return {
    orgAutomationSettings: {
      findUnique: vi.fn().mockResolvedValue(
        overrides?.settings !== undefined
          ? overrides.settings
          : { intentMatchingEnabled: true, intentMatchCostPaise: 0 }
      ),
    },
    autoReply: {
      findMany: vi.fn().mockResolvedValue(
        overrides?.autoReplies ?? [
          {
            id: "ar-1",
            name: "Order Tracking",
            triggerKeyword: "track",
            replyText: "Sure, share your order ID.",
            flowId: null,
          },
        ]
      ),
    },
    flow: {
      findMany: vi.fn().mockResolvedValue(overrides?.flows ?? []),
      findFirst: vi.fn().mockResolvedValue(overrides?.flow ?? null),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(
        overrides?.contact !== undefined
          ? overrides.contact
          : { firstName: "Ali", lastName: null, phoneNumber: PHONE, email: null }
      ),
    },
    creditLedger: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendTextMessage.mockResolvedValue({ messageId: "wamid-1" });
  mockRecordOutbound.mockResolvedValue(undefined);
  mockRunFlow.mockResolvedValue(undefined);
});

describe("runIntentMatching", () => {
  it("returns early when intentMatchingEnabled is false", async () => {
    const prisma = makePrisma({ settings: { intentMatchingEnabled: false, intentMatchCostPaise: 0 } });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockMatchIntentToAutomation).not.toHaveBeenCalled();
  });

  it("returns early when settings record is null", async () => {
    const prisma = makePrisma({ settings: null });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockMatchIntentToAutomation).not.toHaveBeenCalled();
  });

  it("returns early when no candidates exist", async () => {
    const prisma = makePrisma({ autoReplies: [], flows: [] });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockMatchIntentToAutomation).not.toHaveBeenCalled();
  });

  it("returns early when AI confidence is below threshold", async () => {
    const prisma = makePrisma();
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.5,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it("returns early when AI returns no match", async () => {
    const prisma = makePrisma();
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: null,
      matchType: null,
      confidence: 0,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it("sends auto-reply text and writes ledger on confident match", async () => {
    const prisma = makePrisma();
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.9,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "ph-1", PHONE, "Sure, share your order ID.", "tok-1"
    );
    expect(mockRecordOutbound).toHaveBeenCalled();
    const ledgerCall = (prisma.creditLedger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ledgerCall.data.type).toBe("intent_match");
    expect(ledgerCall.data.notes).toBe("auto_reply:ar-1");
    expect(ledgerCall.data.credits).toBe(0n);
  });

  it("also runs linked flow when auto-reply has flowId", async () => {
    const prisma = makePrisma({
      autoReplies: [
        {
          id: "ar-1",
          name: "Order Tracking",
          triggerKeyword: "track",
          replyText: "On it!",
          flowId: "fl-1",
        },
      ],
      flow: { id: "fl-1", flowDefinition: {} },
    });
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.85,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockRunFlow).toHaveBeenCalledWith(
      prisma, "fl-1", {}, expect.objectContaining({ conversationId: CONV_ID })
    );
  });

  it("runs flow directly when matchType is flow", async () => {
    const prisma = makePrisma({
      autoReplies: [],
      flows: [{ id: "fl-1", name: "Order Bot", flowDefinition: {} }],
      flow: { id: "fl-1", flowDefinition: {} },
    });
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "fl-1",
      matchType: "flow",
      confidence: 0.8,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockRunFlow).toHaveBeenCalledWith(
      prisma, "fl-1", {}, expect.objectContaining({ conversationId: CONV_ID })
    );
  });

  it("interpolates {{first_name}} in auto-reply text", async () => {
    const prisma = makePrisma({
      autoReplies: [
        {
          id: "ar-1",
          name: "Greeting",
          triggerKeyword: "hi",
          replyText: "Hello {{first_name}}!",
          flowId: null,
        },
      ],
    });
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.9,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "ph-1", PHONE, "Hello Ali!", "tok-1"
    );
  });
});
