import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
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
