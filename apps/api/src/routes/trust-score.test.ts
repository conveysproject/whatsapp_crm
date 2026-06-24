// apps/api/src/routes/trust-score.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  message: { count: vi.fn(), findMany: vi.fn() },
  contact: { count: vi.fn(), findFirst: vi.fn() },
  campaign: { findMany: vi.fn() },
  orgTrustScoreSnapshot: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
};

const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { trustScoreRouter } = await import("./trust-score.js");
  await app.register(trustScoreRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/trust-score", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns score as sum of 4 category scores", async () => {
    mockPrisma.message.count
      .mockResolvedValueOnce(100)   // totalMessages
      .mockResolvedValueOnce(90)    // deliveredMessages
      .mockResolvedValueOnce(20);   // inboundMessages
    mockPrisma.contact.count
      .mockResolvedValueOnce(50)    // totalContacts
      .mockResolvedValueOnce(40);   // contactsWithTags
    mockPrisma.campaign.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);

    const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { score: number; breakdown: { category: string; score: number; maxScore: number }[] } }>();
    expect(body.data.breakdown).toHaveLength(4);
    // deliveryScore=27, responseScore=5, contactScore=20, campaignScore=4 → total=56
    expect(body.data.score).toBe(body.data.breakdown.reduce((s, b) => s + b.score, 0));
  });

  it("returns recommendations as { text, href }[] objects", async () => {
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.campaign.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
    const body = res.json<{ data: { recommendations: unknown[] } }>();
    // At minimum the "run first campaign" recommendation should appear
    expect(body.data.recommendations.length).toBeGreaterThan(0);
    const first = body.data.recommendations[0] as { text: string; href: string };
    expect(typeof first.text).toBe("string");
    expect(typeof first.href).toBe("string");
    expect(first.href).toMatch(/^\//);
  });

  it("does NOT include history when history param is absent", async () => {
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.campaign.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
    const body = res.json<{ data: { history?: unknown } }>();
    expect(body.data.history).toBeUndefined();
  });

  it("includes history array ordered ascending when ?history=true", async () => {
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    mockPrisma.orgTrustScoreSnapshot.findMany.mockResolvedValue([
      { score: 60, recordedAt: new Date("2026-05-01T02:00:00Z") },
      { score: 70, recordedAt: new Date("2026-05-02T02:00:00Z") },
    ]);

    const res = await app.inject({ method: "GET", url: "/v1/trust-score?history=true" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { history: { score: number; recordedAt: string }[] } }>();
    expect(body.data.history).toHaveLength(2);
    expect(body.data.history[0]!.score).toBe(60);
    expect(body.data.history[1]!.score).toBe(70);
    expect(typeof body.data.history[0]!.recordedAt).toBe("string");
  });
});

describe("GET /v1/contacts/:id/trust-score", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ score: 75, label: "high" }),
    }));
    app = await buildApp();
  });
  afterEach(async () => { vi.unstubAllGlobals(); await app.close(); });

  it("returns { score, label } from ML service for a known contact", async () => {
    mockPrisma.contact.count.mockResolvedValue(1);  // not used directly but needed
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "c-1",
      organizationId: "org-1",
      leadStatus: { name: "Closed Won" },
      tags: ["vip"],
    });
    mockPrisma.message.findMany.mockResolvedValue([
      { direction: "inbound", sentAt: new Date() },
      { direction: "outbound", sentAt: new Date() },
    ]);
    mockPrisma.deal.findMany.mockResolvedValue([{ value: 5000 }]);

    const res = await app.inject({ method: "GET", url: "/v1/contacts/c-1/trust-score" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { score: number; label: string } }>();
    expect(body.data.score).toBe(75);
    expect(body.data.label).toBe("high");
  });

  it("returns 404 when contact not found", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/bad-id/trust-score" });
    expect(res.statusCode).toBe(404);
  });
});

describe("trust-score section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions };
    });
    const { trustScoreRouter } = await import("./trust-score.js");
    await app.register(trustScoreRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when role lacks trust_score_access", async () => {
    const app = await buildAppAs({}); // no trust_score_access
    const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("admin bypasses trust-score section gate", async () => {
    // Stub all prisma and fetch calls needed for admin bypass
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.contact.count.mockResolvedValue(0);
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    mockPrisma.orgTrustScoreSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.deal.findMany.mockResolvedValue([]);
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ recommendations: [] }),
    }));
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
    expect(res.statusCode).toBe(200);
    vi.unstubAllGlobals();
    await app.close();
  });
});
