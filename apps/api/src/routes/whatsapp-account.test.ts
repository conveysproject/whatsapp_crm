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
  organization: { update: vi.fn() },
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

describe("POST /v1/whatsapp-account/connect", () => {
  let app: FastifyInstance;

  function setupFetch(opts: {
    tokenOk?: boolean;
    wabaIdFromDebugToken?: string;
    phones?: { id: string; display_phone_number: string }[];
  } = {}): void {
    const {
      tokenOk = true,
      wabaIdFromDebugToken = "waba-1",
      phones = [{ id: "pn-1", display_phone_number: "+919000000001" }],
    } = opts;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("oauth/access_token")) {
        if (!tokenOk)
          return new Response(JSON.stringify({ error: { message: "Invalid code" } }), { status: 400 });
        return new Response(JSON.stringify({ access_token: "tok-123" }), { status: 200 });
      }
      if (urlStr.includes("debug_token")) {
        const scopes = wabaIdFromDebugToken
          ? [{ scope: "whatsapp_business_messaging", target_ids: [wabaIdFromDebugToken] }]
          : [];
        return new Response(JSON.stringify({ data: { granular_scopes: scopes } }), { status: 200 });
      }
      if (urlStr.includes("phone_numbers")) {
        return new Response(JSON.stringify({ data: phones }), { status: 200 });
      }
      if (urlStr.includes("subscribed_apps") || urlStr.includes("smb_app_data")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      // WABA name lookup or phone display lookup
      return new Response(JSON.stringify({ id: "waba-1", name: "My WABA", display_phone_number: "+919000000001" }), { status: 200 });
    });
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env["META_APP_ID"] = "test-app-id";
    process.env["META_APP_SECRET"] = "test-app-secret";
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns 400 when code is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("MISSING_CODE");
  });

  it("returns 400 when token exchange fails", async () => {
    setupFetch({ tokenOk: false });
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "bad-code", wabaId: "waba-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("TOKEN_EXCHANGE_FAILED");
  });

  it("returns 400 NO_WABA when wabaId absent and debug_token returns none", async () => {
    setupFetch({ wabaIdFromDebugToken: "" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("NO_WABA");
  });

  it("happy path: saves to Organization and VendorSettings", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { wabaId: string } }>().data.wabaId).toBe("waba-1");
    expect(mockPrisma.organization.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.vendorSetting.upsert).toHaveBeenCalled();
  });

  it("isSMB=true triggers smb_app_data call", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", isSMB: true },
    });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const smbCall = fetchSpy.mock.calls.find(([url]) => url.toString().includes("smb_app_data"));
    expect(smbCall).toBeDefined();
  });

  it("flow=onboarding with phoneNumberId sets onboardingStep=done", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", phoneNumberId: "pn-1", flow: "onboarding" },
    });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onboardingStep: "done" }) })
    );
  });

  it("flow=onboarding without phoneNumberId sets onboardingStep=provision_number", async () => {
    setupFetch({ phones: [] });
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", flow: "onboarding" },
    });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onboardingStep: "provision_number" }) })
    );
  });

  it("flow=reconnect does not update onboardingStep", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", flow: "reconnect" },
    });
    const updateCall = mockPrisma.organization.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateCall?.data).not.toHaveProperty("onboardingStep");
  });
});
