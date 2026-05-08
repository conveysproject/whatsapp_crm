import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  savedFilter: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { savedFiltersRouter } = await import("./saved-filters.js");
  await app.register(savedFiltersRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/saved-filters", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns saved filters for the org", async () => {
    mockPrisma.savedFilter.findMany.mockResolvedValue([
      { id: "sf-1", organizationId: "org-1", name: "High Value Mumbai", filterData: { city: "Mumbai", minOrders: 5 } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/saved-filters" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/saved-filters", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a saved filter and returns 201", async () => {
    const created = { id: "sf-2", organizationId: "org-1", name: "Active Contacts", filterData: { status: "active" } };
    mockPrisma.savedFilter.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/saved-filters",
      payload: { name: "Active Contacts", filterData: { status: "active" } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("sf-2");
  });
});

describe("PUT /v1/saved-filters/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates a saved filter", async () => {
    mockPrisma.savedFilter.findFirst.mockResolvedValue({ id: "sf-1", organizationId: "org-1" });
    mockPrisma.savedFilter.update.mockResolvedValue({ id: "sf-1", name: "Updated Name" });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/saved-filters/sf-1",
      payload: { name: "Updated Name" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 when filter not in org", async () => {
    mockPrisma.savedFilter.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PUT", url: "/v1/saved-filters/bad", payload: { name: "x" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/saved-filters/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 for wrong org", async () => {
    mockPrisma.savedFilter.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/saved-filters/bad-id" });
    expect(res.statusCode).toBe(404);
  });

  it("deletes and returns 204", async () => {
    mockPrisma.savedFilter.findFirst.mockResolvedValue({ id: "sf-1", organizationId: "org-1" });
    mockPrisma.savedFilter.delete.mockResolvedValue({ id: "sf-1" });
    const res = await app.inject({ method: "DELETE", url: "/v1/saved-filters/sf-1" });
    expect(res.statusCode).toBe(204);
  });
});
