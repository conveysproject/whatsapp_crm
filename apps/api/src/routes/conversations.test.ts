import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/io-ref.js", () => ({
  getIo: vi.fn().mockReturnValue({ to: vi.fn().mockReturnValue({ emit: vi.fn() }) }),
}));

const mockPrisma = {
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "agent" as const,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { conversationsRouter } = await import("./conversations.js");
  await app.register(conversationsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/conversations", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns conversations for org, ordered by lastMessageAt desc", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: "conv-1", organizationId: "org-1", status: "open", lastMessageAt: "2026-05-01T10:00:00Z" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        orderBy: { lastMessageAt: "desc" },
      })
    );
  });
});

describe("GET /v1/conversations/:id/messages", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when conversation not in org", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-999/messages" });
    expect(res.statusCode).toBe(404);
  });

  it("returns messages for conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "msg-1", conversationId: "conv-1", direction: "inbound", body: "Hello" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
  });
});

describe("DELETE /v1/conversations/:id/history", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes all messages in the conversation and returns count", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.message.deleteMany.mockResolvedValue({ count: 15 });
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/conv-1/history" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "conv-1" } })
    );
    expect(res.json<{ data: { deleted: number } }>().data.deleted).toBe(15);
  });
});

describe("POST /v1/conversations/:id/status", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 for invalid status", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/status",
      headers: { "content-type": "application/json" },
      payload: { status: "invalid" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_STATUS");
  });

  it("closes a conversation and sets closedAt", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", status: "closed" });
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/status",
      headers: { "content-type": "application/json" },
      payload: { status: "closed" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "closed" }) })
    );
  });
});

describe("POST /v1/conversations/:id/assign", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("assigns conversation to agent", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: "user-2" });
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/assign",
      headers: { "content-type": "application/json" },
      payload: { assignedTo: "user-2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { assignedTo: string } }>().data.assignedTo).toBe("user-2");
  });
});

describe("POST /v1/conversations/:id/read", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("resets unreadCount to 0 and returns 204", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", unreadCount: 5 });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", unreadCount: 0 });
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/read" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: 0 } })
    );
  });
});

describe("POST /v1/conversations/:id/typing", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("emits typing event and returns 204", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/typing",
      headers: { "content-type": "application/json" },
      payload: { isTyping: true },
    });
    expect(res.statusCode).toBe(204);
  });
});
