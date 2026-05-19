import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/whatsapp.js", () => ({
  getBusinessProfile: vi.fn().mockResolvedValue({ about: "Test business", address: "Mumbai" }),
  updateBusinessProfile: vi.fn().mockResolvedValue({ success: true }),
  getDisplayName: vi.fn().mockResolvedValue({ display_name: "TrustCRM Demo" }),
  updateDisplayName: vi.fn().mockResolvedValue({ success: true }),
  syncPhoneNumbers: vi.fn().mockResolvedValue([{ id: "pn-1", display_phone_number: "+919000000001" }]),
  getHealthStatus: vi.fn().mockResolvedValue({ status: "connected" }),
  registerPhoneNumber: vi.fn().mockResolvedValue({ success: true }),
  setTwoStepVerification: vi.fn().mockResolvedValue({ success: true }),
}));

const mockPrisma = {
  vendorSetting: { upsert: vi.fn(), findFirst: vi.fn() },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { whatsappAccountRouter } = await import("./whatsapp-account.js");
  await app.register(whatsappAccountRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/whatsapp-account/health-status", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns health status from WhatsApp API", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/whatsapp-account/health-status" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { status: string } }>().data.status).toBe("connected");
  });
});

describe("GET /v1/whatsapp-account/business-profile", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns business profile", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/whatsapp-account/business-profile" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { about: string } }>().data.about).toBe("Test business");
  });
});

describe("POST /v1/whatsapp-account/sync-phone-numbers", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns synced phone numbers list", async () => {
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    const res = await app.inject({ method: "POST", url: "/v1/whatsapp-account/sync-phone-numbers" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
