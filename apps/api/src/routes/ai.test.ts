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
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
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

// ── AI Creator mocks ────────────────────────────────────────────────────────
vi.mock("../lib/ai-creator.js", () => ({
  generateTemplate: vi.fn().mockResolvedValue({
    templateState: {
      name: "eid_sale",
      category: "marketing",
      language: "en",
      parameterFormat: "positional",
      subType: "standard",
      headerType: "image",
      headerText: "",
      headerMediaUrl: "",
      bodyText: "Get 30% off this Eid! Use code EID30.",
      footerText: "Valid till 30 June",
      addSecurityRecommendation: false,
      codeExpirationMinutes: "",
      otpType: "copy_code",
      otpButtonText: "",
      ltoText: "",
      ltoHasExpiration: true,
      couponExampleCode: "",
      buttons: [{ id: "b1", type: "url", text: "Shop Now", url: "https://example.com", urlIsDynamic: false, urlExample: "", phone: "", couponExample: "" }],
      cards: [],
      variableExamples: {},
    },
    imagePrompt: "Festive Eid sale banner with 30% off",
  }),
  refineTemplate: vi.fn().mockResolvedValue({
    templateState: {
      name: "eid_sale",
      category: "marketing",
      language: "en",
      parameterFormat: "positional",
      subType: "standard",
      headerType: "image",
      headerText: "",
      headerMediaUrl: "",
      bodyText: "30% off!",
      footerText: "",
      addSecurityRecommendation: false,
      codeExpirationMinutes: "",
      otpType: "copy_code",
      otpButtonText: "",
      ltoText: "",
      ltoHasExpiration: true,
      couponExampleCode: "",
      buttons: [],
      cards: [],
      variableExamples: {},
    },
    regenerateImage: false,
  }),
  generateFlow: vi.fn().mockResolvedValue({
    flowDefinition: {
      startNodeId: "node-1",
      nodes: [
        { id: "node-1", type: "keyword_match", config: { keyword: "refund", matchType: "contains" }, next: "node-2", nextNo: null },
        { id: "node-2", type: "send_text", config: { text: "Here is our refund policy." }, next: null, nextNo: null },
      ],
    },
    triggerType: "keyword_match",
    suggestedName: "Refund Handling",
  }),
  refineFlow: vi.fn().mockResolvedValue({
    flowDefinition: {
      startNodeId: "node-1",
      nodes: [
        { id: "node-1", type: "keyword_match", config: { keyword: "refund", matchType: "contains" }, next: "node-2", nextNo: null },
        { id: "node-2", type: "wait", config: { duration: 1, unit: "hours" }, next: "node-3", nextNo: null },
        { id: "node-3", type: "send_text", config: { text: "Here is our refund policy." }, next: null, nextNo: null },
      ],
    },
    triggerType: "keyword_match",
  }),
}));

vi.mock("../lib/fal-image.js", () => ({
  generateAndUploadImage: vi.fn().mockResolvedValue("https://cdn.example.com/org-1/image.jpg"),
}));

describe("POST /v1/ai/creator/template/generate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("generates template and image url from description", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/generate",
      payload: { description: "30% off Eid sale with Shop Now button" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { templateState: object; imageUrl: string } };
    expect(body.data.imageUrl).toBe("https://cdn.example.com/org-1/image.jpg");
    expect(body.data.templateState).toMatchObject({ name: "eid_sale", category: "marketing" });
  });

  it("returns 400 if description is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/ai/creator/template/generate", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 if description contains a phone number", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/generate",
      payload: { description: "Send message to +919876543210 about sale" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/ai/creator/template/refine", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("refines template and returns updated state", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/refine",
      payload: {
        templateState: { name: "eid_sale", bodyText: "Get 30% off this Eid!" },
        imageUrl: "https://cdn.example.com/org-1/old.jpg",
        refinement: "Make the body shorter",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { templateState: object; regenerateImage: boolean } };
    expect(body.data.regenerateImage).toBe(false);
  });
});

describe("POST /v1/ai/creator/template/image", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("generates and uploads image, returns url", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/image",
      payload: { prompt: "Festive Eid sale banner with 30% off" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { imageUrl: string } };
    expect(body.data.imageUrl).toBe("https://cdn.example.com/org-1/image.jpg");
  });
});

describe("POST /v1/ai/creator/flow/generate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("generates flow definition from description", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/flow/generate",
      payload: { description: "When customer says refund send our policy" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { flowDefinition: object; triggerType: string; suggestedName: string } };
    expect(body.data.triggerType).toBe("keyword_match");
    expect(body.data.suggestedName).toBe("Refund Handling");
  });

  it("returns 400 if description is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/ai/creator/flow/generate", payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/ai/creator/flow/refine", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("refines flow and returns updated definition", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/flow/refine",
      payload: {
        flowDefinition: { startNodeId: "node-1", nodes: [] },
        triggerType: "keyword_match",
        refinement: "Add a 1-hour wait before sending",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { flowDefinition: { nodes: unknown[] } } };
    expect(body.data.flowDefinition.nodes).toHaveLength(3);
  });
});
