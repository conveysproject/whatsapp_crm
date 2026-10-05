import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  vendorSetting: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { vendorSettingsRouter } = await import("./vendor-settings.js");
  await app.register(vendorSettingsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/vendor-settings", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns all settings for the org as key-value object", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "is_disabled_message_sound_notification", value: "false", dataType: "boolean" },
      { key: "enable_vendor_webhook", value: "true", dataType: "boolean" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, unknown> }>();
    expect(body.data["is_disabled_message_sound_notification"]).toBe(false);
    expect(mockPrisma.vendorSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } })
    );
  });
});

describe("PUT /v1/vendor-settings", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("upserts each key-value pair", async () => {
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/vendor-settings",
      payload: { settings: [{ key: "enable_vendor_webhook", value: "true", dataType: "boolean" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vendorSetting.upsert).toHaveBeenCalledTimes(1);
  });

  // Plan switches and limits are platform-controlled: a tenant admin must not be able to grant themselves
  // plan features or lift plan limits through the generic settings writer.
  it.each([
    "plan_feature_api_access",
    "plan_feature_ai_chat_bot",
    "plan_limit_contacts",
    "plan_limit_team_members",
    "  Plan_Feature_API_Access ",
    "PLAN_LIMIT_FLOWS",
  ])("rejects the platform-controlled key %j with 400 and writes nothing", async (key) => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/vendor-settings",
      payload: { settings: [{ key, value: "1" }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN_KEY" } });
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects the WHOLE request when one key is platform-controlled (no partial write)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/vendor-settings",
      payload: { settings: [{ key: "enable_vendor_webhook", value: "true" }, { key: "plan_limit_contacts", value: "-1" }] },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
  });

  it("does not block ordinary keys that merely contain 'plan' (e.g. plan_notes_text, my_plan_feature_flag)", async () => {
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/vendor-settings",
      payload: { settings: [{ key: "plan_notes_text", value: "x" }, { key: "my_plan_feature_flag", value: "x" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vendorSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it("returns 400 INVALID_BODY (not a 500) for a missing/non-array settings list or non-string keys", async () => {
    for (const payload of [{}, { settings: "x" }, { settings: [{ value: "1" }] }, { settings: [{ key: 5, value: "1" }] }, { settings: [null] }]) {
      const res = await app.inject({ method: "PUT", url: "/v1/vendor-settings", payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_BODY" } });
    }
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("settings section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { vendorSettingsRouter } = await import("./vendor-settings.js");
    await app.register(vendorSettingsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when the role lacks settings_access", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // no settings_access
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.vendorSetting.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows the read when the role has settings_access", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ settings_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses the section gate even with empty permissions", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("blocks PUT when settings_access is not granted", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // no settings_access
    const res = await app.inject({ method: "PUT", url: "/v1/vendor-settings", payload: { settings: [] } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
    await app.close();
  });
});
