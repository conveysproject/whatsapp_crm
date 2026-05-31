import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  conversation: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  contact: { count: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  invitation: { count: vi.fn() },
  campaign: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  campaignRecipient: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { analyticsRouter } = await import("./analytics.js");
  await app.register(analyticsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/analytics/overview", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns overview metrics", async () => {
    mockPrisma.conversation.count.mockResolvedValue(42);
    mockPrisma.contact.count.mockResolvedValue(100);
    mockPrisma.message.count.mockResolvedValue(120);
    mockPrisma.invitation.count.mockResolvedValue(5);
    mockPrisma.campaign.count.mockResolvedValue(2);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview?days=7" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { openConversations: number } }>();
    expect(typeof body.data.openConversations).toBe("number");
  });
});

describe("GET /v1/analytics/agent/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns agent detail data", async () => {
    mockPrisma.conversation.count.mockResolvedValue(2);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/agent/u-1?days=30" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { resolvedCount: number } }>();
    expect(typeof body.data.resolvedCount).toBe("number");
  });
});

describe("GET /v1/analytics/campaigns", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns campaign analytics list", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/campaigns?days=30" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("GET /v1/analytics/conversation-status", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns status breakdown", async () => {
    mockPrisma.conversation.groupBy.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/conversation-status?days=14" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { open: number; resolved: number } }>();
    expect(typeof body.data.open).toBe("number");
    expect(typeof body.data.resolved).toBe("number");
  });
});

describe("GET /v1/analytics/export", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns CSV for conversations tab", async () => {
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=conversations&days=7" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("date,inbound,outbound");
  });

  it("returns CSV for team tab", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=team&days=30" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("agent,open_conversations");
  });

  it("returns 400 for invalid tab", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/analytics/export?tab=invalid&days=7" });
    expect(res.statusCode).toBe(400);
  });
});
