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

  it("does not reveal platform-controlled plan_feature_*/plan_limit_* keys to the tenant", async () => {
    mockPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "enable_vendor_webhook", value: "true", dataType: "boolean" },
      { key: "plan_feature_public_api_blocked", value: "1", dataType: "string" },
      { key: "PLAN_LIMIT_contacts", value: "50", dataType: "string" },
      { key: "plan_notes_text", value: "hello", dataType: "string" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(Object.keys(res.json<{ data: Record<string, unknown> }>().data).sort()).toEqual(["enable_vendor_webhook", "plan_notes_text"]);
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
    "plan_feature_public_api_blocked",
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

describe("vendor-settings RBAC (docs/prd-whatsapp-admin-role.md G1/G2/G3)", () => {
  const rbacPrisma = {
    vendorSetting: { findMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
  };

  async function buildAppAs(role: string): Promise<FastifyInstance> {
    const { defaultsForRole } = await import("../lib/default-role-permissions.js");
    const app = Fastify({ logger: false });
    app.decorate("prisma", rbacPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (req) => {
      req.auth = { userId: "u-1", organizationId: "org-1", role: role as typeof mockAuth.role, permissions: defaultsForRole(role), teamId: null, teamRole: null };
    });
    const { vendorSettingsRouter } = await import("./vendor-settings.js");
    await app.register(vendorSettingsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it.each(["manager", "admin"])("%s cannot write role_permissions_* through vendor-settings", async (role) => {
    const app = await buildAppAs(role);
    const res = await app.inject({
      method: "PUT", url: "/v1/vendor-settings",
      payload: { settings: [{ key: "role_permissions_manager", value: JSON.stringify({ settings_access: "allow", "settings_access@settings_billing": "allow" }) }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("FORBIDDEN_KEY");
    expect(rbacPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("GET never returns role_permissions_* rows", async () => {
    rbacPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "enable_vendor_webhook", value: "true", dataType: "boolean" },
      { key: "role_permissions_agent", value: "{}", dataType: "string" },
    ]);
    const app = await buildAppAs("manager");
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(Object.keys(res.json<{ data: Record<string, unknown> }>().data)).toEqual(["enable_vendor_webhook"]);
    await app.close();
  });

  it("whatsappAdmin GET returns only WABA keys", async () => {
    rbacPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "whatsapp_business_account_id", value: "waba-1", dataType: "string" },
      { key: "display_name", value: "Acme", dataType: "string" },
      { key: "open_ai_input_training_data", value: "secret notes", dataType: "string" },
      { key: "enable_vendor_webhook", value: "true", dataType: "boolean" },
    ]);
    const app = await buildAppAs("whatsappAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json<{ data: Record<string, unknown> }>().data).sort()).toEqual(["display_name", "whatsapp_business_account_id"]);
    await app.close();
  });

  it.each([
    ["/v1/vendor-settings", { settings: [{ key: "enable_vendor_webhook", value: "true" }] }],
    ["/v1/vendor-settings/sound-notification", { disabled: true }],
  ])("whatsappAdmin cannot save org settings (PUT %s)", async (url, payload) => {
    const app = await buildAppAs("whatsappAdmin");
    const res = await app.inject({ method: "PUT", url, payload });
    expect(res.statusCode).toBe(403);
    expect(rbacPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["POST", "/v1/vendor-settings/marketing-messages/enable"],
    ["GET", "/v1/vendor-settings/marketing-messages/status"],
  ])("marketing messages need settings_whatsapp: manager gets 403 on %s %s", async (method, url) => {
    const app = await buildAppAs("manager");
    const res = await app.inject({ method: method as "GET", url });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("manager (no settings_whatsapp) GET hides WABA keys", async () => {
    rbacPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "enable_vendor_webhook", value: "true", dataType: "boolean" },
      { key: "whatsapp_business_account_id", value: "waba-1", dataType: "string" },
      { key: "whatsapp_phone_numbers_data", value: "[]", dataType: "string" },
      { key: "wa_register_attempts", value: "2", dataType: "string" },
    ]);
    const app = await buildAppAs("manager");
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(Object.keys(res.json<{ data: Record<string, unknown> }>().data)).toEqual(["enable_vendor_webhook"]);
    await app.close();
  });

  it.each(["admin", "whatsappAdmin"])("the Meta access token is never returned, even to %s", async (role) => {
    rbacPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "whatsapp_business_account_id", value: "waba-1", dataType: "string" },
      { key: "whatsapp_access_token", value: "EAAG-secret", dataType: "string" },
    ]);
    const app = await buildAppAs(role);
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    const data = res.json<{ data: Record<string, unknown> }>().data;
    expect(data["whatsapp_access_token"]).toBeUndefined();
    expect(data["whatsapp_business_account_id"]).toBe("waba-1");
    await app.close();
  });

  it.each(["whatsapp_access_token", "whatsapp_business_account_id", "current_phone_number_id", "Display_Name"])(
    "manager cannot write WABA key %s through vendor-settings", async (key) => {
      const app = await buildAppAs("manager");
      const res = await app.inject({ method: "PUT", url: "/v1/vendor-settings", payload: { settings: [{ key, value: "x" }] } });
      expect(res.statusCode).toBe(403);
      expect(rbacPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
      await app.close();
    });

  it("admin can still write WABA keys through vendor-settings", async () => {
    rbacPrisma.vendorSetting.upsert.mockResolvedValue({});
    const app = await buildAppAs("admin");
    const res = await app.inject({ method: "PUT", url: "/v1/vendor-settings", payload: { settings: [{ key: "display_name", value: "Acme" }] } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("whatsappAdmin can read marketing messages status", async () => {
    rbacPrisma.vendorSetting.findUnique.mockResolvedValue({ value: "true" });
    const app = await buildAppAs("whatsappAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings/marketing-messages/status" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
