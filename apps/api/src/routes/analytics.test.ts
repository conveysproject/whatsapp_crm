import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  conversation: { count: vi.fn(), findMany: vi.fn() },
  contact: { count: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  invitation: { count: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

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
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { openConversations: number } }>();
    expect(typeof body.data.openConversations).toBe("number");
  });
});
