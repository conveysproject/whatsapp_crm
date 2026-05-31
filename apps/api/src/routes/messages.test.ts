import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  conversation: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "agent" as const,
  permissions: {},
};

vi.mock("../lib/whatsapp.js", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ messageId: "wamid-123" }),
  sendMediaMessage: vi.fn().mockResolvedValue({ messageId: "wamid-media-456" }),
  sendInteractiveMessage: vi.fn().mockResolvedValue({ messageId: "wamid-int-789" }),
}));

vi.mock("../lib/trigger-dispatcher.js", () => ({
  cancelNoReplyJobs: vi.fn(),
}));

const baseConversation = {
  id: "conv-1",
  organizationId: "org-1",
  whatsappContactId: "+919000000001",
  organization: { phoneNumberId: "pn-1", wabaAccessToken: "token-abc" },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { messagesRouter } = await import("./messages.js");
  await app.register(messagesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/messages/log", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns paginated messages filtered by date range", async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "m-1", body: "Hello", direction: "inbound", status: "delivered", createdAt: new Date("2026-05-01"), conversation: { contact: { firstName: "Ravi", lastName: null, phoneNumber: "+91900000001" } } },
    ]);
    mockPrisma.message.count.mockResolvedValue(1);
    const res = await app.inject({
      method: "GET",
      url: "/v1/messages/log?from=2026-05-01&to=2026-05-08&direction=inbound",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[]; total: number }>().total).toBe(1);
  });
});

describe("POST /v1/conversations/:id/messages — text", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when conversation not found", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { text: "Hello" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when conversation has no WA contact", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...baseConversation, whatsappContactId: null });
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { text: "Hello" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("NO_WA_CONTACT");
  });

  it("sends text message and returns 201", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-1", contentType: "text", body: "Hello", direction: "outbound", status: "sent" });
    mockPrisma.conversation.update.mockResolvedValue({});
    const { sendTextMessage } = await import("../lib/whatsapp.js");

    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { text: "Hello" },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(sendTextMessage)).toHaveBeenCalledWith("pn-1", "+919000000001", "Hello", "token-abc");
  });
});

describe("POST /v1/conversations/:id/messages — media", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sends image message and returns 201", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-2", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-2", contentType: "image", direction: "outbound", status: "sent" });
    mockPrisma.conversation.update.mockResolvedValue({});
    const { sendMediaMessage } = await import("../lib/whatsapp.js");

    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { contentType: "image", mediaId: "wa-media-123" },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(sendMediaMessage)).toHaveBeenCalledWith("pn-1", "+919000000001", "image", "wa-media-123", undefined, "token-abc");
  });

  it("returns 400 when mediaId is missing", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { contentType: "image" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("MISSING_MEDIA_ID");
  });
});

describe("POST /v1/conversations/:id/messages — interactive", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  const interactivePayload = {
    type: "button" as const,
    body: { text: "Pick an option" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "btn-1", title: "Yes" } },
        { type: "reply", reply: { id: "btn-2", title: "No" } },
      ],
    },
  };

  it("sends interactive button message and returns 201", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-3", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-3", contentType: "interactive", direction: "outbound", status: "sent" });
    mockPrisma.conversation.update.mockResolvedValue({});
    const { sendInteractiveMessage } = await import("../lib/whatsapp.js");

    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { contentType: "interactive", interactive: interactivePayload },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(sendInteractiveMessage)).toHaveBeenCalledWith("pn-1", "+919000000001", interactivePayload, "token-abc");
  });

  it("returns 400 when interactive payload is missing", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: { contentType: "interactive" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("MISSING_INTERACTIVE");
  });
});

describe("POST /v1/conversations/:id/messages — interactive isSystemMessage guard", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates message draft with isSystemMessage: false for interactive messages", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-int-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({
      id: "msg-int-1", contentType: "interactive", direction: "outbound",
      status: "sent", isSystemMessage: false,
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: {
        contentType: "interactive",
        interactive: {
          type: "button",
          header: { type: "text", text: "Deal: Test Deal" },
          body: { text: "Value: 25000\n\nSome notes" },
          footer: { text: "Reply using the buttons below" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "deal_accept_abc123", title: "Accept" } },
              { type: "reply", reply: { id: "deal_reject_abc123", title: "Reject" } },
              { type: "reply", reply: { id: "deal_negotiate_abc123", title: "Negotiate" } },
            ],
          },
        },
      },
    });

    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSystemMessage: false }),
      })
    );
  });
});
