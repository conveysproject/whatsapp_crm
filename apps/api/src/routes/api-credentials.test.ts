import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as SafeUrlModule from "../lib/public-api/safe-url.js";

vi.mock("../lib/audit.js", () => ({ writeAdminAudit: vi.fn() }));
vi.mock("../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof SafeUrlModule>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("bad")) throw new real.UnsafeUrlError("unsafe"); return new URL(u); }) };
});

const mockPrisma = {
  apiKey: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
};

async function buildApp(role = "admin", permissions: Record<string, string> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId: "org-1", role: role as "admin", permissions, teamId: null, teamRole: null };
  });
  const { apiCredentialsRouter } = await import("./api-credentials.js");
  await app.register(apiCredentialsRouter, { prefix: "/v1" });
  return app;
}

const ORIG_FLAG = process.env["PUBLIC_API_ENABLED"];

describe("api-credentials", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 9).toString("base64");
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    process.env["PUBLIC_API_ENABLED"] = "true";
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null); // no kill switch
    mockPrisma.apiKey.count.mockResolvedValue(0);
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close(); delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    if (ORIG_FLAG === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = ORIG_FLAG;
  });

  it("creates a credential, returns the token once, stores hash + encrypted copy scoped to the org", async () => {
    mockPrisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "key-1", name: data["name"], createdAt: new Date() }));
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { authId: string; authToken: string } }>();
    expect(data.authId).toBe("key-1");
    expect(data.authToken).toMatch(/^[0-9a-f]{64}$/);
    const arg = mockPrisma.apiKey.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(arg["organizationId"]).toBe("org-1");
    expect(arg["keyHash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(arg["keyHash"]).not.toBe(data.authToken);
    expect(typeof arg["tokenEnc"]).toBe("string");
    expect(JSON.stringify(arg)).not.toContain(data.authToken);
  });

  it("503 and nothing stored when PUBLIC_API_TOKEN_KEY is missing", async () => {
    delete process.env["PUBLIC_API_TOKEN_KEY"];
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(503);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("S6: POST answers 400 INVALID_BODY for a non-string, blank or overlong name and non-string or overlong URLs", async () => {
    const bad: unknown[] = [
      { name: 123 }, { name: ["a"] }, { name: { x: 1 } }, { name: "   " }, { name: "x".repeat(101) },
      { name: "Prod", callbackUrl: ["https://ok.example.com/a"] }, { name: "Prod", inboundUrl: { href: "https://ok.example.com" } },
      { name: "Prod", callbackUrl: 42 }, { name: "Prod", callbackUrl: `https://ok.example.com/${"a".repeat(2050)}` },
    ];
    for (const payload of bad) {
      const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: payload as object });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_BODY", message: expect.any(String) } });
    }
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("S6: POST still accepts a 100-char name, null and empty URLs", async () => {
    mockPrisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "key-1", name: data["name"], createdAt: new Date() }));
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: ` ${"x".repeat(100)} `, callbackUrl: null, inboundUrl: "" } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.apiKey.create.mock.calls[0]![0].data).toMatchObject({ name: "x".repeat(100), callbackUrl: null, inboundUrl: null });
  });

  it("S6: PATCH answers 400 INVALID_BODY for a blank/non-string/overlong name and array/object URLs, and writes nothing", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "key-1", organizationId: "org-1" });
    const bad: unknown[] = [
      { name: "" }, { name: "  " }, { name: 5 }, { name: null }, { name: "x".repeat(101) },
      { callbackUrl: ["https://ok.example.com/a"] }, { inboundUrl: { a: 1 } }, { inboundUrl: `https://ok.example.com/${"a".repeat(2050)}` },
    ];
    for (const payload of bad) {
      const res = await app.inject({ method: "PATCH", url: "/v1/api-credentials/key-1", payload: payload as object });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_BODY" } });
    }
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("S6: PATCH updates a valid name and clears a URL with null", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "key-1", organizationId: "org-1" });
    mockPrisma.apiKey.update.mockResolvedValue({ id: "key-1" });
    const res = await app.inject({ method: "PATCH", url: "/v1/api-credentials/key-1", payload: { name: " New ", callbackUrl: null } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.apiKey.update.mock.calls[0]![0].data).toEqual({ name: "New", callbackUrl: null });
  });

  const NOT_AVAILABLE = { error: { code: "API_NOT_AVAILABLE", message: "API access is not available for this organization." } };
  const calls: Array<[string, string, object?]> = [
    ["POST", "/v1/api-credentials", { name: "Prod" }], ["GET", "/v1/api-credentials"],
    ["PATCH", "/v1/api-credentials/k", { name: "x" }], ["POST", "/v1/api-credentials/k/rotate"],
  ];

  it("403 API_NOT_AVAILABLE on every route except revoke when the org is blocked or not allow-listed, with an identical body", async () => {
    const bodies: string[] = [];
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url} blocked`).toBe(403);
      expect(res.json()).toEqual(NOT_AVAILABLE);
      bodies.push(res.body);
    }
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    process.env["PUBLIC_API_ALLOWED_ORGS"] = "someone-else";
    for (const [i, [method, url, payload]] of calls.entries()) {
      const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url} not allowed`).toBe(403);
      expect(res.body).toBe(bodies[i]);
    }
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("403 API_NOT_AVAILABLE on the four non-revoke routes when the platform flag is off (identical body, no kill-switch lookup)", async () => {
    process.env["PUBLIC_API_ENABLED"] = "false";
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url} flag off`).toBe(403);
      expect(res.json()).toEqual(NOT_AVAILABLE);
    }
    expect(mockPrisma.vendorSetting.findFirst).not.toHaveBeenCalled();
  });

  it("DELETE (revoke) still works when the org is blocked, not allow-listed, or the platform flag is off", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "k" });
    mockPrisma.apiKey.update.mockResolvedValue({});
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    expect((await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" })).statusCode).toBe(204);
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    process.env["PUBLIC_API_ALLOWED_ORGS"] = "someone-else";
    expect((await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" })).statusCode).toBe(204);
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    process.env["PUBLIC_API_ENABLED"] = "false";
    expect((await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" })).statusCode).toBe(204);
    expect(mockPrisma.apiKey.update).toHaveBeenCalledTimes(3);
    expect(mockPrisma.apiKey.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "k", organizationId: "org-1", revokedAt: null });
  });

  it("DELETE for a blocked org is still org-scoped (404 for another org's credential)", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    expect((await app.inject({ method: "DELETE", url: "/v1/api-credentials/other" })).statusCode).toBe(404);
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("DELETE without the permission is FORBIDDEN, even for a blocked org", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    const denied = await buildApp("agent", { settings_access: "allow" });
    const res = await denied.inject({ method: "DELETE", url: "/v1/api-credentials/k" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    await denied.close();
  });

  it("an org with no plan setting at all can use the routes", async () => {
    mockPrisma.apiKey.findMany.mockResolvedValue([]);
    expect((await app.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(200);
  });

  it("permission is settings_access@settings_api_key: denied without it, allowed with it, admin bypasses", async () => {
    const denied = await buildApp("agent", { settings_access: "allow" });
    expect((await denied.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(403);
    await denied.close();
    const oldKey = await buildApp("agent", { settings_access: "allow", "settings_access@api_credentials": "allow" });
    expect((await oldKey.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(403);
    await oldKey.close();
    mockPrisma.apiKey.findMany.mockResolvedValue([]);
    const allowed = await buildApp("agent", { settings_access: "allow", "settings_access@settings_api_key": "allow" });
    expect((await allowed.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(200);
    await allowed.close();
    expect((await app.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(200); // admin
  });

  it("users without permission get FORBIDDEN even when the org is blocked (permission is checked first)", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    const denied = await buildApp("agent", { settings_access: "allow" });
    const res = await denied.inject({ method: "GET", url: "/v1/api-credentials" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    await denied.close();
  });

  it("cap: 10 active credentials -> 409 CREDENTIAL_LIMIT and nothing is created", async () => {
    mockPrisma.apiKey.count.mockResolvedValue(10);
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: "CREDENTIAL_LIMIT", message: "You can have at most 10 active credentials. Revoke one first." } });
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("cap: 9 active credentials -> created; the count is org-scoped and ignores revoked credentials", async () => {
    mockPrisma.apiKey.count.mockResolvedValue(9);
    mockPrisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "key-1", name: data["name"], createdAt: new Date() }));
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.apiKey.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", revokedAt: null } });
  });

  it("cap: checked before the encryption key is touched (409, not 503, when over the cap)", async () => {
    delete process.env["PUBLIC_API_TOKEN_KEY"];
    mockPrisma.apiKey.count.mockResolvedValue(10);
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(409);
  });

  it("rejects an unsafe callback URL", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "P", callbackUrl: "https://bad.example.com/h" } });
    expect(res.statusCode).toBe(400);
  });

  it("list never returns hashes or encrypted tokens and is org-scoped", async () => {
    mockPrisma.apiKey.findMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/v1/api-credentials" });
    const q = mockPrisma.apiKey.findMany.mock.calls[0]![0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(q.where["organizationId"]).toBe("org-1");
    expect(q.select["keyHash"]).toBeUndefined();
    expect(q.select["tokenEnc"]).toBeUndefined();
  });

  it("PATCH/rotate/revoke 404 for a credential of another org", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    expect((await app.inject({ method: "PATCH", url: "/v1/api-credentials/k", payload: { name: "x" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/api-credentials/k/rotate" })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" })).statusCode).toBe(404);
    expect(mockPrisma.apiKey.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "k", organizationId: "org-1" });
  });

  it("revoke sets revokedAt instead of deleting", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "k" });
    mockPrisma.apiKey.update.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.apiKey.update.mock.calls[0]![0].data.revokedAt).toBeInstanceOf(Date);
  });
});

describe("api-credentials: send_for_children scope", () => {
  let app: FastifyInstance;
  const ORIG_PARENT = process.env["PARENT_ORGS_ENABLED"];
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 9).toString("base64");
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    process.env["PUBLIC_API_ENABLED"] = "true";
    process.env["PARENT_ORGS_ENABLED"] = "true";
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    mockPrisma.apiKey.count.mockResolvedValue(0);
    mockPrisma.organization.findUnique.mockResolvedValue({ isParent: true, parentOrganizationId: null });
    mockPrisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "key-1", name: data["name"], createdAt: new Date() }));
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
    if (ORIG_PARENT === undefined) delete process.env["PARENT_ORGS_ENABLED"]; else process.env["PARENT_ORGS_ENABLED"] = ORIG_PARENT;
    if (ORIG_FLAG === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = ORIG_FLAG;
  });
  const create = (scopes?: unknown) => app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod", ...(scopes === undefined ? {} : { scopes }) } });

  it("a parent admin can create a key with the scope", async () => {
    expect((await create(["whatsapp", "send_for_children"])).statusCode).toBe(201);
    expect(mockPrisma.apiKey.create.mock.calls[0]![0].data.scopes).toEqual(["whatsapp", "send_for_children"]);
  });

  it("without the scope in the body the key is created as before", async () => {
    expect((await create()).statusCode).toBe(201);
    expect(mockPrisma.apiKey.create.mock.calls[0]![0].data.scopes).toEqual(["whatsapp"]);
  });

  it("403 for a non-parent org and nothing is stored", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ isParent: false, parentOrganizationId: null });
    expect((await create(["send_for_children"])).statusCode).toBe(403);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("403 for a child org (has a parent) and when the feature flag is off", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ isParent: true, parentOrganizationId: "p-1" });
    expect((await create(["send_for_children"])).statusCode).toBe(403);
    mockPrisma.organization.findUnique.mockResolvedValue({ isParent: true, parentOrganizationId: null });
    delete process.env["PARENT_ORGS_ENABLED"];
    expect((await create(["send_for_children"])).statusCode).toBe(403);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("400 for unknown scopes or a non-array", async () => {
    expect((await create(["admin"])).statusCode).toBe(400);
    expect((await create("send_for_children")).statusCode).toBe(400);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  describe("parent_access is required to manage scoped keys", () => {
    const keyPerms = { settings_access: "allow", "settings_access@settings_api_key": "allow" };
    const scoped = { id: "key-s", organizationId: "org-1", scopes: ["whatsapp", "send_for_children"], revokedAt: null };
    const plain = { id: "key-p", organizationId: "org-1", scopes: ["whatsapp"], revokedAt: null };
    let mgr: FastifyInstance;
    beforeEach(async () => {
      mockPrisma.apiKey.update.mockResolvedValue({ id: "key-s" });
      mgr = await buildApp("manager", keyPerms);
    });
    afterEach(async () => { await mgr.close(); });

    it("a manager with settings_api_key but no parent_access gets 403 creating a scoped key", async () => {
      const res = await mgr.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "P", scopes: ["send_for_children"] } });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
    });

    it("...and 403 rotating or patching an existing scoped key; nothing is updated", async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(scoped);
      expect((await mgr.inject({ method: "POST", url: "/v1/api-credentials/key-s/rotate" })).statusCode).toBe(403);
      expect((await mgr.inject({ method: "PATCH", url: "/v1/api-credentials/key-s", payload: { callbackUrl: "https://x.example.com/h" } })).statusCode).toBe(403);
      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("D15 admin only: even WITH parent_access granted, a manager gets 403 on create, rotate and PATCH of a scoped key", async () => {
      const m2 = await buildApp("manager", { ...keyPerms, parent_access: "allow" });
      mockPrisma.apiKey.findFirst.mockResolvedValue(scoped);
      expect((await m2.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "P", scopes: ["send_for_children"] } })).statusCode).toBe(403);
      expect((await m2.inject({ method: "POST", url: "/v1/api-credentials/key-s/rotate" })).statusCode).toBe(403);
      expect((await m2.inject({ method: "PATCH", url: "/v1/api-credentials/key-s", payload: { name: "N" } })).statusCode).toBe(403);
      expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
      await m2.close();
    });

    it("the parent admin can still create, rotate and patch a scoped key", async () => {
      const adm = await buildApp("admin", {});
      mockPrisma.apiKey.findFirst.mockResolvedValue(scoped);
      expect((await adm.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "P", scopes: ["send_for_children"] } })).statusCode).toBe(201);
      expect((await adm.inject({ method: "POST", url: "/v1/api-credentials/key-s/rotate" })).statusCode).toBe(200);
      expect((await adm.inject({ method: "PATCH", url: "/v1/api-credentials/key-s", payload: { name: "N" } })).statusCode).toBe(200);
      await adm.close();
    });

    it("ordinary keys are unaffected for the same manager", async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(plain);
      mockPrisma.apiKey.update.mockResolvedValue({ id: "key-p" });
      expect((await mgr.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "P" } })).statusCode).toBe(201);
      expect((await mgr.inject({ method: "POST", url: "/v1/api-credentials/key-p/rotate" })).statusCode).toBe(200);
      expect((await mgr.inject({ method: "PATCH", url: "/v1/api-credentials/key-p", payload: { name: "N" } })).statusCode).toBe(200);
    });
  });
});
