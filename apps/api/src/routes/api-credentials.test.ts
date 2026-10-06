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

describe("api-credentials", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 9).toString("base64");
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null); // no kill switch
    mockPrisma.apiKey.count.mockResolvedValue(0);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); delete process.env["PUBLIC_API_ALLOWED_ORGS"]; });

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
    ["PATCH", "/v1/api-credentials/k", { name: "x" }], ["POST", "/v1/api-credentials/k/rotate"], ["DELETE", "/v1/api-credentials/k"],
  ];

  it("403 API_NOT_AVAILABLE on every route when the org is blocked or not allow-listed, with an identical body", async () => {
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
