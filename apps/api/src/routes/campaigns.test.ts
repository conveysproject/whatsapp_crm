import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn() },
  campaignQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const mockPrisma = {
  campaign: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  segment: { findFirst: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { campaignsRouter } = await import("./campaigns.js");
  await app.register(campaignsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/campaigns", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates campaign with status draft", async () => {
    mockPrisma.campaign.create.mockResolvedValue({
      id: "camp-1", name: "Summer Promo", status: "draft", organizationId: "org-1",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      payload: { name: "Summer Promo", templateId: "t-1", segmentId: "seg-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { status: string } }>().data.status).toBe("draft");
  });
});

describe("GET /v1/campaigns", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns campaigns for org", async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      { id: "camp-1", name: "Promo", status: "draft", organizationId: "org-1" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
