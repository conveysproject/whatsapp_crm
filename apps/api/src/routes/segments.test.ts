import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  segment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  contact: { findMany: vi.fn() },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { segmentsRouter } = await import("./segments.js");
  await app.register(segmentsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/segments", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns segments for org", async () => {
    mockPrisma.segment.findMany.mockResolvedValue([
      { id: "seg-1", organizationId: "org-1", name: "Hot Leads", filters: [] },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/segments" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/segments/:id/evaluate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns matching contact phone numbers", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", filters: [{ field: "lifecycleStage", operator: "equals", value: "lead" }],
    });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", phoneNumber: "+919000000001" },
    ]);
    const res = await app.inject({ method: "POST", url: "/v1/segments/seg-1/evaluate" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { phones: string[] } }>().data.phones).toContain("+919000000001");
  });
});

describe("DELETE /v1/segments/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when segment not in org", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/segments/seg-999" });
    expect(res.statusCode).toBe(404);
  });
});
