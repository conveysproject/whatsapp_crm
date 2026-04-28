import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  routingRule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { routingRouter } = await import("./routing.js");
  await app.register(routingRouter, { prefix: "/v1" });
  return app;
}

describe("PATCH /v1/conversations/:id/assign", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("assigns conversation to user and returns 200", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: "user-99" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/conversations/conv-1/assign",
      payload: { assignedTo: "user-99" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedTo: "user-99" }) })
    );
  });
});

describe("GET /v1/routing-rules", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns routing rules for org", async () => {
    mockPrisma.routingRule.findMany.mockResolvedValue([
      { id: "r-1", organizationId: "org-1", name: "WA rule", priority: 10, assignTo: "user-1", isActive: true },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/routing-rules" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
