import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/r2.js", () => ({
  uploadToR2: vi.fn().mockResolvedValue({ key: "org-1/uuid.jpg", url: "https://pub.r2.dev/org-1/uuid.jpg" }),
  deleteFromR2: vi.fn().mockResolvedValue(undefined),
  R2_PUBLIC_URL: "https://pub.r2.dev",
}));

const mockPrisma = {
  mediaAsset: {
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
  // Register multipart support
  await app.register((await import("@fastify/multipart")).default);
  const { mediaAssetsRouter } = await import("./media-assets.js");
  await app.register(mediaAssetsRouter, { prefix: "/v1" });
  return app;
}

const sampleAsset = {
  id: "ma-1",
  organizationId: "org-1",
  title: "Product Banner",
  description: null,
  type: "image",
  fileUrl: "https://example.com/banner.jpg",
  mimeType: null,
  fileSizeBytes: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("GET /v1/media-assets", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns list of active assets", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([sampleAsset]);
    const res = await app.inject({ method: "GET", url: "/v1/media-assets" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });

  it("filters by type when provided", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([sampleAsset]);
    const res = await app.inject({ method: "GET", url: "/v1/media-assets?type=image" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "image" }) }),
    );
  });
});

describe("POST /v1/media-assets (URL)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates asset from URL", async () => {
    mockPrisma.mediaAsset.create.mockResolvedValue(sampleAsset);
    const res = await app.inject({
      method: "POST",
      url: "/v1/media-assets",
      payload: { title: "Product Banner", type: "image", fileUrl: "https://example.com/banner.jpg" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { title: string } }>().data.title).toBe("Product Banner");
  });

  it("returns 400 when required fields missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/media-assets",
      payload: { type: "image" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/media-assets",
      payload: { title: "X", type: "exe", fileUrl: "https://example.com/x.exe" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /v1/media-assets/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates title and description", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(sampleAsset);
    mockPrisma.mediaAsset.update.mockResolvedValue({ ...sampleAsset, title: "New Title" });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/media-assets/ma-1",
      payload: { title: "New Title" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { title: string } }>().data.title).toBe("New Title");
  });

  it("returns 404 when not found", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PUT", url: "/v1/media-assets/nope", payload: { title: "X" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/media-assets/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("soft-deletes URL assets (isActive = false)", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(sampleAsset); // fileUrl is example.com, not R2
    mockPrisma.mediaAsset.update.mockResolvedValue({ ...sampleAsset, isActive: false });
    const res = await app.inject({ method: "DELETE", url: "/v1/media-assets/ma-1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it("hard-deletes R2 assets and calls deleteFromR2", async () => {
    const r2Asset = { ...sampleAsset, fileUrl: "https://pub.r2.dev/org-1/uuid.jpg" };
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(r2Asset);
    mockPrisma.mediaAsset.delete.mockResolvedValue(r2Asset);
    const res = await app.inject({ method: "DELETE", url: "/v1/media-assets/ma-1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.mediaAsset.delete).toHaveBeenCalled();
    // Verify R2 cleanup was called with extracted key
    const { deleteFromR2 } = await import("../lib/r2.js");
    expect(deleteFromR2).toHaveBeenCalledWith("org-1/uuid.jpg");
  });

  it("returns 404 when not found", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/media-assets/nope" });
    expect(res.statusCode).toBe(404);
  });
});
