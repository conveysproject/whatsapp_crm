import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/whatsapp.js", () => ({
  uploadMedia: vi.fn().mockResolvedValue({ mediaId: "wa-media-123" }),
  getMediaUrl: vi.fn().mockResolvedValue({ url: "https://example.com/media/file.jpg", mimeType: "image/jpeg" }),
  downloadMediaBytes: vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes")),
  uploadResumableMedia: vi.fn().mockResolvedValue({ mediaId: "wa-media-large-456" }),
}));

const mockPrisma = {
  organization: {
    findUnique: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Register multipart support
  await app.register((await import("@fastify/multipart")).default, { limits: { fileSize: 50 * 1024 * 1024 } });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { mediaRouter } = await import("./media.js");
  await app.register(mediaRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/media/upload", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 when org has no WA credentials", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    const form = new FormData();
    form.append("file", new Blob(["test"], { type: "image/png" }), "test.png");
    const res = await app.inject({ method: "POST", url: "/v1/media/upload", payload: form as unknown as Record<string, unknown> });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("WA_NOT_CONFIGURED");
  });

  it("uploads file and returns mediaId", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      phoneNumberId: "12345",
      wabaAccessToken: "token-abc",
    });
    const { uploadMedia } = await import("../lib/whatsapp.js");
    vi.mocked(uploadMedia).mockResolvedValue({ mediaId: "wa-media-123" });

    const boundary = "----boundary";
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\nfakedata\r\n--${boundary}--\r\n`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { mediaId: string } }>().data.mediaId).toBe("wa-media-123");
  });
});

describe("GET /v1/media/:mediaId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 when org has no WA credentials", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ wabaAccessToken: null });
    const res = await app.inject({ method: "GET", url: "/v1/media/some-media-id" });
    expect(res.statusCode).toBe(400);
  });

  it("proxies media bytes with correct content-type", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ wabaAccessToken: "token-abc" });
    const { getMediaUrl, downloadMediaBytes } = await import("../lib/whatsapp.js");
    vi.mocked(getMediaUrl).mockResolvedValue({ url: "https://cdn.whatsapp.net/media/abc.jpg", mimeType: "image/jpeg" });
    vi.mocked(downloadMediaBytes).mockResolvedValue(Buffer.from("fake-jpeg"));

    const res = await app.inject({ method: "GET", url: "/v1/media/wa-media-123" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
  });
});
