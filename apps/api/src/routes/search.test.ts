import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contact: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  message: { findMany: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { searchRouter } = await import("./search.js");
  await app.register(searchRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/search", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns search results across all types", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([{ id: "c-1", name: "Alice", phoneNumber: "+1234", email: null }]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/v1/search?q=Alice" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { contacts: unknown[] } }>();
    expect(body.data.contacts).toHaveLength(1);
  });

  it("returns 400 when q is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search" });
    expect(res.statusCode).toBe(400);
  });
});
