import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { hashToken } from "../../lib/public-api/credentials.js";

vi.mock("../../lib/queue.js", () => ({ redisConnection: undefined })); // in-memory rate limit store
vi.mock("../../lib/public-api/queues.js", () => ({ publicApiSendQueue: { add: vi.fn() }, publicApiCallbackQueue: { add: vi.fn() } }));

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  apiMessageMeta: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  template: { findMany: vi.fn(), findFirst: vi.fn() },
};
const ID = "11111111-1111-1111-1111-111111111111";
const auth = `Basic ${Buffer.from(`${ID}:good`).toString("base64")}`;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  // simulate the global Clerk hook: it must skip routes marked public
  app.addHook("preHandler", async (request, reply) => {
    if (!(request.routeOptions?.config as { public?: boolean } | undefined)?.public) return reply.status(401).send({ error: "clerk" });
  });
  const { publicApiRouter } = await import("./index.js");
  await app.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
  return app;
}

const ORIG_FLAG = process.env["PUBLIC_API_ENABLED"];

describe("publicApiRouter", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_RATE_LIMIT"] = "3";
    process.env["PUBLIC_API_ENABLED"] = "true";
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: ID, organizationId: "org-1", keyHash: hashToken("good"), revokedAt: null, lastUsedAt: new Date() });
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null); // no kill switch
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(0);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); if (ORIG_FLAG === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = ORIG_FLAG; delete process.env["PUBLIC_API_RATE_LIMIT"]; delete process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"]; });

  const rebuild = async () => { await app.close(); vi.resetModules(); return buildApp(); };
  const list = (headers: Record<string, string> = { authorization: auth }) =>
    app.inject({ method: "GET", url: `/v1/Account/${ID}/Message/`, headers });

  it("serves public routes with Basic auth (Clerk hook does not apply) and 401s without it", async () => {
    expect((await list()).statusCode).toBe(200);
    const res = await list({});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ api_id: expect.any(String) }); // Plivo-style body, not the Clerk one
  });

  it("serves the template routes in the same authenticated child context (401 without credentials, org-scoped 404 with them)", async () => {
    const url = `/v1/Account/${ID}/WhatsApp/Template/waba-x/`;
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active", whatsappBusinessAccountId: "waba-1", wabaAccessToken: "t" });
    const res = await app.inject({ method: "GET", url, headers: { authorization: auth } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ api_id: expect.any(String), error: "Template not found.", error_code: "TEMPLATE_NOT_FOUND" });
  });

  it("rate limits per client+credential with HTTP 429 and a Plivo-style body", async () => {
    for (let i = 0; i < 3; i++) expect((await list()).statusCode).toBe(200);
    const res = await list();
    expect(res.statusCode).toBe(429);
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
    expect(Number(res.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(res.json()).toMatchObject({ api_id: expect.any(String), error_code: "RATE_LIMITED", hint: expect.stringMatching(/Wait \d+ second/) });
  });

  it("keeps per-credential buckets independent", async () => {
    const ID_B = "22222222-2222-2222-2222-222222222222";
    const authB = `Basic ${Buffer.from(`${ID_B}:good`).toString("base64")}`;
    mockPrisma.apiKey.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, organizationId: "org-1", keyHash: hashToken("good"), revokedAt: null, lastUsedAt: new Date(),
    }));
    const get = (id: string, a: string) => app.inject({ method: "GET", url: `/v1/Account/${id}/Message/`, headers: { authorization: a } });
    for (let i = 0; i < 3; i++) expect((await get(ID, auth)).statusCode).toBe(200);
    expect((await get(ID, auth)).statusCode).toBe(429);
    expect((await get(ID_B, authB)).statusCode).toBe(200);
  });

  it("does not let unauthenticated requests consume a victim's authenticated bucket", async () => {
    process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"] = "1000";
    app = await rebuild();
    const bad = `Basic ${Buffer.from(`${ID}:wrong`).toString("base64")}`;
    for (let i = 0; i < 20; i++) expect((await list({ authorization: bad })).statusCode).toBe(401);
    expect((await list()).statusCode).toBe(200);
    delete process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"];
  });

  it("applies a coarse pre-auth guard keyed by IP, even to unauthenticated requests", async () => {
    process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"] = "3";
    app = await rebuild();
    for (let i = 0; i < 3; i++) expect((await list({})).statusCode).toBe(401);
    const res = await list({});
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
    expect(res.json()).toMatchObject({ api_id: expect.any(String), error_code: "RATE_LIMITED", hint: expect.stringMatching(/Wait \d+ second/) });
    delete process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"];
  });

  it("pre-auth guard keys by the real client address behind the proxy; spoofed leading X-Forwarded-For entries do not mint buckets", async () => {
    process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"] = "3";
    app = await rebuild();
    const from = (xff: string) => app.inject({ method: "GET", url: `/v1/Account/${ID}/Message/`, remoteAddress: "100.64.0.7", headers: { "x-forwarded-for": xff } });
    for (let i = 0; i < 3; i++) expect((await from(`${i}.${i}.${i}.${i + 1}, 203.0.113.5`)).statusCode).toBe(401);
    expect((await from("8.8.8.8, 203.0.113.5")).statusCode).toBe(429); // same real client, different spoofed prefix
    expect((await from("203.0.113.6")).statusCode).toBe(401); // a different real client has its own bucket
    delete process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"];
  });

  it("pre-auth guard ignores X-Forwarded-For from a public peer (direct connection)", async () => {
    process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"] = "3";
    app = await rebuild();
    const from = (xff: string) => app.inject({ method: "GET", url: `/v1/Account/${ID}/Message/`, remoteAddress: "198.51.100.20", headers: { "x-forwarded-for": xff } });
    for (let i = 0; i < 3; i++) expect((await from(`9.9.9.${i}`)).statusCode).toBe(401);
    expect((await from("9.9.9.99")).statusCode).toBe(429);
    delete process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"];
  });

  it.each(["", "abc", "0", "-5"])("falls back to the default limit when PUBLIC_API_RATE_LIMIT=%j", async (v) => {
    process.env["PUBLIC_API_RATE_LIMIT"] = v;
    app = await rebuild();
    for (let i = 0; i < 5; i++) expect((await list()).statusCode).toBe(200);
  });

  it("positiveIntEnv falls back for missing/invalid values", async () => {
    const { positiveIntEnv } = await import("./index.js");
    process.env["X_TEST_N"] = "7";
    expect(positiveIntEnv("X_TEST_N", 1)).toBe(7);
    for (const v of ["", "abc", "0", "-5"]) { process.env["X_TEST_N"] = v; expect(positiveIntEnv("X_TEST_N", 9)).toBe(9); }
    delete process.env["X_TEST_N"];
    expect(positiveIntEnv("X_TEST_N", 9)).toBe(9);
  });

  it("error handler tolerates a null throw without crashing", async () => {
    const { publicApiErrorHandler } = await import("./index.js");
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    const request = { log: { error: vi.fn() } };
    expect(() => publicApiErrorHandler(null as never, request as never, reply as never)).not.toThrow();
    expect(reply.status).toHaveBeenCalledWith(500);
  });

  it("S4: the 500 log carries only the error name/code and request id, never the message (phone numbers, text)", async () => {
    const { publicApiErrorHandler } = await import("./index.js");
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    const request = { id: "req-77", log: { error: vi.fn() } };
    const err = Object.assign(new Error("Invalid invocation: dst 14155552672 text secret words"), { name: "PrismaClientValidationError", code: "P2009" });
    publicApiErrorHandler(err, request as never, reply as never);
    const logged = JSON.stringify(request.log.error.mock.calls);
    expect(logged).toContain("PrismaClientValidationError");
    expect(logged).toContain("P2009");
    expect(logged).toContain("req-77");
    expect(logged).not.toContain("14155552672");
    expect(logged).not.toContain("secret");
  });

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  // Captures the request's apiId (set by the plugin's onRequest hook) at response time, via a hook registered after the plugin.
  async function buildCapturingApp(ids: string[]): Promise<FastifyInstance> {
    const a = Fastify({ logger: false });
    a.decorate("prisma", mockPrisma as unknown as PrismaClient);
    a.addHook("onSend", async (request, _reply, payload) => { ids.push((request as { apiId?: string }).apiId ?? ""); return payload; });
    const { publicApiRouter } = await import("./index.js");
    await a.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
    return a;
  }

  it("malformed JSON gets a clear INVALID_JSON message whose api_id is the request's id", async () => {
    const ids: string[] = [];
    await app.close();
    app = await buildCapturingApp(ids);
    const res = await app.inject({ method: "POST", url: `/v1/Account/${ID}/Message/`, headers: { authorization: auth, "content-type": "application/json" }, payload: "{not json" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "INVALID_JSON", error: expect.stringContaining("not valid JSON"), hint: expect.any(String), api_id: expect.stringMatching(UUID) });
    expect(ids).toHaveLength(1);
    expect(res.json().api_id).toBe(ids[0]);
  });

  it("an empty JSON body gets EMPTY_BODY", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/Account/${ID}/Message/`, headers: { authorization: auth, "content-type": "application/json" }, payload: "" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "EMPTY_BODY", api_id: expect.any(String) });
  });

  it("wrong Content-Type gets UNSUPPORTED_CONTENT_TYPE (415)", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/Account/${ID}/Message/`, headers: { authorization: auth, "content-type": "application/xml" }, payload: "<a/>" });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ error_code: "UNSUPPORTED_CONTENT_TYPE", api_id: expect.any(String) });
  });

  it("an oversized body gets BODY_TOO_LARGE (413)", async () => {
    await app.close();
    app = Fastify({ logger: false, bodyLimit: 10 });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    const { publicApiRouter } = await import("./index.js");
    await app.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
    const res = await app.inject({ method: "POST", url: `/v1/Account/${ID}/Message/`, headers: { authorization: auth, "content-type": "application/json" }, payload: JSON.stringify({ a: "x".repeat(100) }) });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error_code: "BODY_TOO_LARGE" });
  });

  it("an unexpected failure returns INTERNAL_ERROR with a retry/api_id hint, the request's api_id, and never echoes the raw message", async () => {
    const ids: string[] = [];
    await app.close();
    app = await buildCapturingApp(ids);
    mockPrisma.apiKey.findUnique.mockRejectedValue(new Error("connection to db-host-secret:5432 refused"));
    const res = await list();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error_code: "INTERNAL_ERROR", api_id: expect.stringMatching(UUID), hint: expect.stringContaining("api_id") });
    expect(res.json().hint).toMatch(/[Rr]etry/);
    expect(res.json().api_id).toBe(ids[0]);
    expect(res.body).not.toContain("db-host-secret");
  });

  it("429 carries Retry-After and a wait hint", async () => {
    for (let i = 0; i < 3; i++) expect((await list()).statusCode).toBe(200);
    const res = await list();
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
    expect(res.json()).toMatchObject({ error_code: "RATE_LIMITED", api_id: expect.stringMatching(UUID), hint: expect.stringMatching(/\d+ second/) });
  });

  it("429 api_id equals the request's id", async () => {
    const ids: string[] = [];
    await app.close();
    app = await buildCapturingApp(ids);
    for (let i = 0; i < 3; i++) await list();
    ids.length = 0;
    const res = await list();
    expect(res.statusCode).toBe(429);
    expect(res.json().api_id).toBe(ids[0]);
  });
});
