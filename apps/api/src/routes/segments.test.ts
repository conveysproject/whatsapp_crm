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

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

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
      { id: "seg-1", organizationId: "org-1", name: "Hot Leads", filters: [], match: "all" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/segments" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/segments", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates segment with match field", async () => {
    mockPrisma.segment.create.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "any",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments",
      payload: { name: "VIP", filters: [], match: "any" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { match: string } }>().data.match).toBe("any");
    expect(mockPrisma.segment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ match: "any" }) })
    );
  });

  it("defaults match to all when not provided", async () => {
    mockPrisma.segment.create.mockResolvedValue({
      id: "seg-2", organizationId: "org-1", name: "New", filters: [], match: "all",
    });
    await app.inject({ method: "POST", url: "/v1/segments", payload: { name: "New", filters: [] } });
    expect(mockPrisma.segment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ match: "all" }) })
    );
  });
});

describe("POST /v1/segments/:id/evaluate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns count and contacts array", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", match: "all",
      filters: [{ field: "leadStatusId", operator: "equals", value: "ls-1" }],
    });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Ravi", lastName: "Kumar", phoneNumber: "+919000000001", leadStatus: { name: "New Lead", color: "#F97316" } },
    ]);
    const res = await app.inject({ method: "POST", url: "/v1/segments/seg-1/evaluate" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { count: number; contacts: unknown[] } }>();
    expect(body.data.count).toBe(1);
    expect(body.data.contacts).toHaveLength(1);
  });

  it("passes match mode to evaluateSegment", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", match: "any",
      filters: [
        { field: "leadStatusId", operator: "equals", value: "ls-1" },
        { field: "tags", operator: "contains", value: "VIP" },
      ],
    });
    mockPrisma.contact.findMany.mockResolvedValue([]);
    await app.inject({ method: "POST", url: "/v1/segments/seg-1/evaluate" });
    // When match is "any", Prisma should receive OR clause
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      })
    );
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

describe("PATCH /v1/segments/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates match field when provided", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "all",
    });
    mockPrisma.segment.update.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "any",
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/segments/seg-1",
      payload: { match: "any" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.segment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ match: "any" }) })
    );
  });
});

describe("PATCH /v1/segments/:id — whatsappOptedOnly", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("persists whatsappOptedOnly when patched", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "all", whatsappOptedOnly: false,
    });
    mockPrisma.segment.update.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "all", whatsappOptedOnly: true,
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/segments/seg-1",
      payload: { whatsappOptedOnly: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.segment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ whatsappOptedOnly: true }),
      })
    );
  });
});

describe("POST /v1/segments/preview", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns count and contacts without touching segment records", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Alice", lastName: "Smith", phoneNumber: "+1234567890", leadStatus: null },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments/preview",
      payload: { filters: [], match: "all", whatsappOptedOnly: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { count: number; contacts: unknown[] } }>();
    expect(body.data.count).toBe(1);
    expect(body.data.contacts).toHaveLength(1);
    expect(mockPrisma.segment.create).not.toHaveBeenCalled();
    expect(mockPrisma.segment.update).not.toHaveBeenCalled();
  });

  it("defaults filters to [] and match to all when body is empty", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments/preview",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBe(0);
  });
});
