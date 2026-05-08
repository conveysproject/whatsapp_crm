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
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "agent" as const,
};

vi.mock("../lib/whatsapp.js", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ messageId: "wamid-123" }),
}));

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
      { id: "m-1", body: "Hello", direction: "inbound", status: "delivered", createdAt: new Date("2026-05-01"), contact: null },
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
