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
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(0);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); delete process.env["PUBLIC_API_RATE_LIMIT"]; });

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
