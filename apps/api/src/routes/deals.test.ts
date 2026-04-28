import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  deal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pipeline: { findFirst: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

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
      { id: "d-1", organizationId: "org-1", title: "Deal A", stage: "new", pipelineId: "p-1" },
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
