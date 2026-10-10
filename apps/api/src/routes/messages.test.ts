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
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  template: { findFirst: vi.fn(), update: vi.fn() },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "agent" as const,
  permissions: { inbox_access: "allow" },
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

const wa = vi.hoisted(() => {
  class WaApiError extends Error {
    constructor(message: string, readonly metaCode: number | null, readonly metaSubcode: number | null, readonly metaError: unknown = null) {
      super(message);
    }
  }
  return { WaApiError };
});

vi.mock("../lib/whatsapp.js", () => ({
  WaApiError: wa.WaApiError,
  sendTextMessage: vi.fn().mockResolvedValue({ messageId: "wamid-123" }),
  sendMediaMessage: vi.fn().mockResolvedValue({ messageId: "wamid-media-456" }),
  sendInteractiveMessage: vi.fn().mockResolvedValue({ messageId: "wamid-int-789" }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ messageId: "wamid-tpl-321" }),
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

  it("returns deliveryError for failed rows and null for rows without one", async () => {
    const err = { code: 131049, subcode: null, title: "Healthy ecosystem", message: "Blocked", details: null, href: null };
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "m-1", status: "failed", deliveryError: err, createdAt: new Date("2026-05-01"), conversation: { contact: null } },
      { id: "m-2", status: "sent", deliveryError: null, createdAt: new Date("2026-05-01"), conversation: { contact: null } },
    ]);
    mockPrisma.message.count.mockResolvedValue(2);
    const res = await app.inject({ method: "GET", url: "/v1/messages/log" });
    const rows = res.json<{ data: Array<{ deliveryError: unknown }> }>().data;
    expect(rows[0]!.deliveryError).toEqual(err);
    expect(rows[1]!.deliveryError).toBeNull();
    const arg = mockPrisma.message.findMany.mock.calls[0]![0] as { select?: unknown };
    expect(arg.select).toBeUndefined();
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

  it("stores Meta's reason on the draft when the send is rejected", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({});
    const { sendTextMessage } = await import("../lib/whatsapp.js");
    const metaError = { code: 131049, subcode: null, title: null, message: "Blocked for 919876543210", details: null, href: null };
    vi.mocked(sendTextMessage).mockRejectedValueOnce(new wa.WaApiError("WA send failed: {}", 131049, null, metaError));
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/messages", headers: { "content-type": "application/json" }, payload: { text: "Hello" } });
    expect(res.statusCode).toBe(500);
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: "msg-1" }, data: { status: "failed", deliveryError: metaError } });
  });

  it("still marks the draft failed (no deliveryError) for non-Meta errors", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({});
    const { sendTextMessage } = await import("../lib/whatsapp.js");
    vi.mocked(sendTextMessage).mockRejectedValueOnce(new Error("network"));
    await app.inject({ method: "POST", url: "/v1/conversations/conv-1/messages", headers: { "content-type": "application/json" }, payload: { text: "Hello" } });
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: "msg-1" }, data: { status: "failed" } });
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

describe("POST /v1/conversations/:id/messages - impersonated reply is tagged in platform audit", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    mockPrisma.adminAuditLog.create.mockResolvedValue({});
    app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (request) => {
      request.auth = { ...mockAuth, impersonation: { adminId: "sa-1", mode: "edit" as const } };
    });
    const { messagesRouter } = await import("./messages.js");
    await app.register(messagesRouter, { prefix: "/v1" });
  });
  afterEach(async () => { await app.close(); });

  it("records admin id + message id in the admin audit, without adding tenant-visible fields", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-1", contentType: "text", body: "Hi", direction: "outbound", status: "sent", sentAt: new Date() });
    mockPrisma.conversation.update.mockResolvedValue({});
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" }, payload: { text: "Hi" },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "sa-1", action: "impersonation.message_sent", targetType: "message", targetId: "msg-1",
        metadata: { conversationId: "conv-1", organizationId: "org-1", asUserId: "user-1" },
      }),
    });
    const createArg = mockPrisma.message.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(JSON.stringify(createArg.data)).not.toContain("sa-1");
  });
});

describe("POST /v1/conversations/:id/messages - template analytics columns", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  const send = (payload: object) => app.inject({
    method: "POST",
    url: "/v1/conversations/conv-1/messages",
    headers: { "content-type": "application/json" },
    payload,
  });

  it("records templateId and source=dashboard on a template send", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...baseConversation, contact: null });
    mockPrisma.template.findFirst.mockResolvedValue({
      id: "tpl-9", name: "welcome", language: "en_US", status: "approved", metaTemplateId: "meta-9",
      components: [{ type: "BODY", text: "Hello there" }],
    });
    mockPrisma.message.create.mockResolvedValue({ id: "msg-t-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-t-1", status: "sent", sentAt: new Date() });
    mockPrisma.conversation.update.mockResolvedValue({});

    const res = await send({ contentType: "template", templateId: "tpl-9" });

    expect(res.statusCode).toBe(201);
    const data = (mockPrisma.message.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ contentType: "template", organizationId: "org-1", templateId: "tpl-9", source: "dashboard" });
  });

  it("leaves templateId and source off a text send", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-1", status: "sent" });
    mockPrisma.conversation.update.mockResolvedValue({});

    const res = await send({ text: "Hello" });

    expect(res.statusCode).toBe(201);
    const data = (mockPrisma.message.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("templateId");
    expect(data).not.toHaveProperty("source");
  });
});
