import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  chatbot: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn().mockResolvedValue(0) },
  contact: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn() },
  botSession: { upsert: vi.fn() },
  vendorSetting: { findFirst: vi.fn().mockResolvedValue(null) },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { chatbotsRouter } = await import("./chatbots.js");
  await app.register(chatbotsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/chatbots", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates chatbot with isActive: false", async () => {
    mockPrisma.chatbot.create.mockResolvedValue({
      id: "bot-1", name: "Welcome Bot", flowId: "flow-1", isActive: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/chatbots",
      payload: { name: "Welcome Bot", flowId: "flow-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { isActive: boolean } }>().data.isActive).toBe(false);
  });
});

describe("GET /v1/chatbots/active-for/:contactId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns active chatbots when contact has bot enabled", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1", disableBot: false });
    mockPrisma.chatbot.findMany.mockResolvedValue([
      { id: "cb-1", name: "Product FAQ", isActive: true, startTrigger: "product", description: null },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/chatbots/active-for/c-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });

  it("returns empty array when contact has bot disabled", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1", disableBot: true });
    const res = await app.inject({ method: "GET", url: "/v1/chatbots/active-for/c-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });

  it("returns 404 when contact not found", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/chatbots/active-for/bad" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /v1/chatbots/:id/quick-send/:contactId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("upserts bot session for contact's latest conversation", async () => {
    mockPrisma.chatbot.findFirst.mockResolvedValue({ id: "cb-1", organizationId: "org-1" });
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.botSession.upsert.mockResolvedValue({ id: "bs-1" });
    const res = await app.inject({ method: "POST", url: "/v1/chatbots/cb-1/quick-send/c-1" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.botSession.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when no conversation exists for contact", async () => {
    mockPrisma.chatbot.findFirst.mockResolvedValue({ id: "cb-1", organizationId: "org-1" });
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/chatbots/cb-1/quick-send/c-1" });
    expect(res.statusCode).toBe(400);
  });
});
