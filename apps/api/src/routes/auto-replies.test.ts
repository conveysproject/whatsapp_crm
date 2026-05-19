import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  autoReply: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  contact: { findFirst: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { autoRepliesRouter } = await import("./auto-replies.js");
  await app.register(autoRepliesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/auto-replies", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns list of auto-replies for the org", async () => {
    mockPrisma.autoReply.findMany.mockResolvedValue([
      { id: "ar-1", organizationId: "org-1", name: "Welcome Bot" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/auto-replies" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/auto-replies/:id/duplicate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a copy of the auto-reply with 'Copy of' prefix", async () => {
    const original = {
      id: "ar-1",
      organizationId: "org-1",
      name: "Welcome Bot",
      triggerType: "keyword",
      triggerKeyword: "hi",
      replyText: "Hello! Welcome.",
      replyData: null,
      flowId: null,
      parentId: null,
      priorityIndex: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.autoReply.findFirst.mockResolvedValue(original);
    mockPrisma.autoReply.create.mockResolvedValue({ ...original, id: "ar-2", name: "Copy of Welcome Bot" });
    const res = await app.inject({ method: "POST", url: "/v1/auto-replies/ar-1/duplicate" });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { name: string } }>().data.name).toBe("Copy of Welcome Bot");
    expect(mockPrisma.autoReply.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Copy of Welcome Bot" }),
      })
    );
  });

  it("returns 404 when auto-reply not found in org", async () => {
    mockPrisma.autoReply.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/auto-replies/bad-id/duplicate" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /v1/auto-replies/:id/preview/:contactId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns the first message the bot would send to the contact", async () => {
    mockPrisma.autoReply.findFirst.mockResolvedValue({
      id: "ar-1",
      organizationId: "org-1",
      replyText: "Hello {{first_name}}!",
      replyData: null,
    });
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1", firstName: "Priya", lastName: "Shah", phone: "+91900000001" });
    const res = await app.inject({ method: "GET", url: "/v1/auto-replies/ar-1/preview/c-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { preview: string } }>().data.preview).toBe("Hello Priya!");
  });

  it("returns 404 when auto-reply not found", async () => {
    mockPrisma.autoReply.findFirst.mockResolvedValue(null);
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1" });
    const res = await app.inject({ method: "GET", url: "/v1/auto-replies/bad/preview/c-1" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when contact not found", async () => {
    mockPrisma.autoReply.findFirst.mockResolvedValue({ id: "ar-1", organizationId: "org-1", replyText: "Hi!", replyData: null });
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/auto-replies/ar-1/preview/bad-contact" });
    expect(res.statusCode).toBe(404);
  });
});
