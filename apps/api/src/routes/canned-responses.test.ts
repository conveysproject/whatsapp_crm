import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  cannedResponse: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { cannedResponsesRouter } = await import("./canned-responses.js");
  await app.register(cannedResponsesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/canned-responses", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns canned responses for the org", async () => {
    mockPrisma.cannedResponse.findMany.mockResolvedValue([
      { id: "cr-1", organizationId: "org-1", name: "Greeting", shortcut: "/hi", content: "Hello! How can I help?" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/canned-responses" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/canned-responses", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a canned response and returns 201", async () => {
    const created = { id: "cr-2", organizationId: "org-1", name: "Price", shortcut: "/price", content: "Our pricing starts at ₹999/month." };
    mockPrisma.cannedResponse.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/canned-responses",
      payload: { name: "Price", shortcut: "/price", content: "Our pricing starts at ₹999/month." },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("cr-2");
  });
});

describe("DELETE /v1/canned-responses/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when canned response not found in org", async () => {
    mockPrisma.cannedResponse.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/canned-responses/bad-id" });
    expect(res.statusCode).toBe(404);
  });
});
