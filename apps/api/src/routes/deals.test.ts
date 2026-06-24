import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  deal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pipeline: { findFirst: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { dealsRouter } = await import("./deals.js");
  await app.register(dealsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/deals", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns deals for org scoped by optional pipelineId", async () => {
    mockPrisma.deal.findMany.mockResolvedValue([
      {
        id: "deal-1",
        organizationId: "org-1",
        title: "Big Contract",
        value: 5000,
        stage: "new",
        pipelineId: "pipe-1",
        contactId: "contact-1",
        assignedTo: null,
        notes: null,
        contact: { id: "contact-1", firstName: "Alice", lastName: "Smith", phone: "+14155552671" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/deals?pipelineId=p-1" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ pipelineId: "p-1" }) })
    );
  });
});

describe("PATCH /v1/deals/:id/stage", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates deal stage", async () => {
    mockPrisma.deal.findFirst.mockResolvedValue({ id: "d-1", organizationId: "org-1" });
    mockPrisma.deal.update.mockResolvedValue({ id: "d-1", stage: "won" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/deals/d-1/stage",
      payload: { stage: "won" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "won" }) })
    );
  });
});

describe("PATCH /v1/deals/:id with notes", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates deal notes", async () => {
    mockPrisma.deal.findFirst.mockResolvedValue({ id: "deal-1", organizationId: "org-1" });
    mockPrisma.deal.update.mockResolvedValue({
      id: "deal-1",
      title: "Big Contract",
      notes: "Called on Monday, follow up Thursday",
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/deals/deal-1",
      payload: { notes: "Called on Monday, follow up Thursday" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { notes: string } }>().data.notes).toBe("Called on Monday, follow up Thursday");
  });
});

describe("deals section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions };
    });
    const { dealsRouter } = await import("./deals.js");
    await app.register(dealsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when role lacks deals_access", async () => {
    const app = await buildAppAs({}); // no deals_access
    const res = await app.inject({ method: "GET", url: "/v1/deals" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.deal.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows GET /deals when role has deals_access", async () => {
    mockPrisma.deal.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ deals_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/deals" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses deals section gate", async () => {
    mockPrisma.deal.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/deals" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
