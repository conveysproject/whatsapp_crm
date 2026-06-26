import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  infoMaterial: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { infoMaterialsRouter } = await import("./info-materials.js");
  await app.register(infoMaterialsRouter, { prefix: "/v1" });
  return app;
}

const sampleItem = {
  id: "im-1",
  organizationId: "org-1",
  name: "Product Brochure",
  type: "document",
  url: "https://example.com/brochure.pdf",
  fileUrl: null,
  description: "Our product catalog",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("GET /v1/info-materials", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns list of info materials", async () => {
    mockPrisma.infoMaterial.findMany.mockResolvedValue([sampleItem]);
    const res = await app.inject({ method: "GET", url: "/v1/info-materials" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });

  it("filters by type when provided", async () => {
    mockPrisma.infoMaterial.findMany.mockResolvedValue([sampleItem]);
    const res = await app.inject({ method: "GET", url: "/v1/info-materials?type=document" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.infoMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "document" }) })
    );
  });
});

describe("POST /v1/info-materials", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a new info material", async () => {
    mockPrisma.infoMaterial.create.mockResolvedValue(sampleItem);
    const res = await app.inject({
      method: "POST",
      url: "/v1/info-materials",
      payload: { name: "Product Brochure", type: "document", url: "https://example.com/brochure.pdf" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { name: string } }>().data.name).toBe("Product Brochure");
  });

  it("returns 400 when name or type missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/info-materials",
      payload: { type: "document" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /v1/info-materials/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates an existing info material", async () => {
    mockPrisma.infoMaterial.findFirst.mockResolvedValue(sampleItem);
    mockPrisma.infoMaterial.update.mockResolvedValue({ ...sampleItem, name: "Updated Brochure" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/info-materials/im-1",
      payload: { name: "Updated Brochure" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { name: string } }>().data.name).toBe("Updated Brochure");
  });

  it("returns 404 when not found", async () => {
    mockPrisma.infoMaterial.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/info-materials/im-999",
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/info-materials/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes item and returns 204", async () => {
    mockPrisma.infoMaterial.findFirst.mockResolvedValue(sampleItem);
    mockPrisma.infoMaterial.delete.mockResolvedValue(sampleItem);
    const res = await app.inject({ method: "DELETE", url: "/v1/info-materials/im-1" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockPrisma.infoMaterial.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/info-materials/im-999" });
    expect(res.statusCode).toBe(404);
  });
});
