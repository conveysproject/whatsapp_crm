import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  template: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { templatesRouter } = await import("./templates.js");
  await app.register(templatesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns templates for org", async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      { id: "t-1", organizationId: "org-1", name: "Welcome", status: "pending" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/templates" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates template with status pending", async () => {
    const created = { id: "t-2", organizationId: "org-1", name: "Promo", status: "pending" };
    mockPrisma.template.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates",
      payload: { name: "Promo", category: "marketing", language: "en", components: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { status: string } }>().data.status).toBe("pending");
  });
});
