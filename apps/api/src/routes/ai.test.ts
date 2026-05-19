import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/claude.js", () => ({
  generateSuggestions: vi.fn().mockResolvedValue(["Sure!", "Let me check.", "I understand."]),
  generateSmartReplies: vi.fn().mockResolvedValue([
    "Thank you for reaching out! How can I help you today?",
    "We'd be happy to assist. Could you provide more details?",
    "Our team is on it. We'll get back to you shortly.",
  ]),
  detectIntentWithConfidence: vi.fn().mockResolvedValue({ intent: "purchase_inquiry", confidence: 0.91 }),
}));

describe("generateSuggestions", () => {
  it("returns array of suggestion strings", async () => {
    const { generateSuggestions } = await import("../lib/claude.js");
    const result = await generateSuggestions([
      { role: "user", content: "Hello, I need help with my order" },
    ]);
    expect(Array.isArray(result)).toBe(true);
  });
});

const mockPrisma = {
  message: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  vendorSetting: {
    findFirst: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {},
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { aiRouter } = await import("./ai.js");
  await app.register(aiRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/ai/smart-replies", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns smart replies for a conversation using Claude", async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { body: "Hi, I want to buy your product", direction: "inbound" },
      { body: "Sure! Which product are you interested in?", direction: "outbound" },
    ]);
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/smart-replies",
      payload: { conversationId: "conv-1" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { replies: string[] } }>();
    expect(Array.isArray(body.data.replies)).toBe(true);
    expect(body.data.replies).toHaveLength(3);
  });

  it("uses Flowise when flowise_url vendor setting is configured", async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { body: "Can I get a refund?", direction: "inbound" },
    ]);
    mockPrisma.vendorSetting.findFirst
      .mockResolvedValueOnce({ key: "flowise_url", value: "https://flowise.example.com" })
      .mockResolvedValueOnce({ key: "flowise_access_token", value: "token-abc" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      json: async () => ({ replies: ["Of course!", "Let me process that.", "I'll help you."] }),
    } as unknown as Response);

    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/smart-replies",
      payload: { conversationId: "conv-2" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { replies: string[] } }>();
    expect(body.data.replies).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://flowise.example.com/api/v1/prediction/smart-replies",
      expect.objectContaining({ method: "POST" })
    );

    fetchSpy.mockRestore();
  });
});

describe("POST /v1/ai/intent", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns intent and confidence for a message", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/intent",
      payload: { messageId: "msg-1", text: "I want to buy your premium plan" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { intent: string; confidence: number } }>();
    expect(body.data.intent).toBe("purchase_inquiry");
    expect(body.data.confidence).toBe(0.91);
  });
});
