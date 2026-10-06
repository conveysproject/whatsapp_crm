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

describe("publicApiRouter", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_RATE_LIMIT"] = "3";
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: ID, organizationId: "org-1", keyHash: hashToken("good"), revokedAt: null, lastUsedAt: new Date() });
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null); // no kill switch
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(0);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); delete process.env["PUBLIC_API_RATE_LIMIT"]; delete process.env["PUBLIC_API_PREAUTH_RATE_LIMIT"]; });

  const rebuild = async () => { await app.close(); vi.resetModules(); return buildApp(); };
  const list = (headers: Record<string, string> = { authorization: auth }) =>
    app.inject({ method: "GET", url: `/v1/Account/${ID}/Message/`, headers });

  it("serves public routes with Basic auth (Clerk hook does not apply) and 401s without it", async () => {
    expect((await list()).statusCode).toBe(200);
    const res = await list({});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ api_id: expect.any(String) }); // Plivo-style body, not the Clerk one
  });

  it("rate limits per client+credential with HTTP 429 and a Plivo-style body", async () => {
    for (let i = 0; i < 3; i++) expect((await list()).statusCode).toBe(200);
    const res = await list();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ api_id: expect.any(String), error: "Request was throttled." });
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
    expect(res.json()).toEqual({ api_id: expect.any(String), error: "Request was throttled." });
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

  it("answers a malformed JSON body with a 400 Plivo-style body", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/Account/${ID}/Message/`,
      headers: { authorization: auth, "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ api_id: expect.any(String), error: expect.any(String) });
  });

  it("answers an unexpected failure with a 500 Plivo-style body that never echoes the raw message", async () => {
    mockPrisma.apiKey.findUnique.mockRejectedValue(new Error("connection to db-host-secret:5432 refused"));
    const res = await list();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ api_id: expect.any(String), error: "Internal server error" });
    expect(res.body).not.toContain("db-host-secret");
  });
});
