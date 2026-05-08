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
  campaignRecipient: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  groupContact: { findMany: vi.fn() },
  contact: { count: vi.fn() },
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

describe("GET /v1/campaigns/:id/targeted-count", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns count of contacts targeted by groups", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1" });
    mockPrisma.groupContact.findMany.mockResolvedValue([{ contactId: "c-1" }, { contactId: "c-2" }]);
    mockPrisma.contact.count.mockResolvedValue(2);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/camp-1/targeted-count?groupIds=g-1,g-2" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /v1/campaigns/:id/abort", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets campaign status to aborted", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1", status: "running" });
    mockPrisma.campaign.update.mockResolvedValue({ id: "camp-1", status: "aborted" });
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/camp-1/abort" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "aborted" } })
    );
  });

  it("returns 404 if campaign not found", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/bad-id/abort" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /v1/campaigns/:id/archive", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets campaign isArchived to true", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1" });
    mockPrisma.campaign.update.mockResolvedValue({ id: "camp-1", isArchived: true });
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/camp-1/archive" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isArchived: true } })
    );
  });
});

describe("POST /v1/campaigns/:id/requeue-failed", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("requeues failed recipients", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1" });
    mockPrisma.campaignRecipient.updateMany.mockResolvedValue({ count: 3 });
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/camp-1/requeue-failed" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { requeued: number } }>().data.requeued).toBe(3);
  });
});

describe("GET /v1/campaigns/:id/queue-log", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns pending recipients", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1" });
    mockPrisma.campaignRecipient.findMany.mockResolvedValue([
      { id: "cr-1", contactId: "c-1", status: "pending", contact: { firstName: "Priya", lastName: null, phone: "+91900" } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/camp-1/queue-log" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("GET /v1/campaigns/:id/expired-log", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns expired recipients", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1" });
    mockPrisma.campaignRecipient.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/camp-1/expired-log" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });
});

describe("GET /v1/campaigns/:id/report", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns campaign stats", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "camp-1", organizationId: "org-1", name: "Test Campaign" });
    mockPrisma.campaignRecipient.count.mockResolvedValue(10);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/camp-1/report" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { stats: { sent: number } } }>();
    expect(body.data.stats).toHaveProperty("sent");
    expect(body.data.stats).toHaveProperty("delivered");
    expect(body.data.stats).toHaveProperty("read");
    expect(body.data.stats).toHaveProperty("failed");
    expect(body.data.stats).toHaveProperty("pending");
  });
});
