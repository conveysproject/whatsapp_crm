import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { hashToken } from "../../lib/public-api/credentials.js";

const h = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("../../lib/queue.js", () => ({ redisConnection: undefined }));
vi.mock("../../lib/public-api/queues.js", () => ({
  publicApiSendQueue: { add: vi.fn(async () => undefined) }, publicApiCallbackQueue: { add: vi.fn() },
}));
const snapshotThrows = vi.hoisted(() => ({ on: false, calls: 0 }));
vi.mock("../../lib/public-api/payload-capture.js", async (orig) => {
  const real = await orig<{ buildPayloadSnapshot: (i: unknown) => unknown }>();
  return { ...real, buildPayloadSnapshot: (i: unknown) => { snapshotThrows.calls++; if (snapshotThrows.on) throw new Error("snapshot down"); return real.buildPayloadSnapshot(i); } };
});
vi.mock("../../lib/public-api/usage.js", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, recordApiRequest: (e: unknown) => h.record(e) };
});

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  apiMessageMeta: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  template: { findMany: vi.fn() },
  contact: { upsert: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn(), update: vi.fn() },
};
const ID = "11111111-1111-1111-1111-111111111111";
const auth = (token = "good", id = ID) => `Basic ${Buffer.from(`${id}:${token}`).toString("base64")}`;
const ORIG_FLAG = process.env["PUBLIC_API_ENABLED"];

describe("public API usage hook", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_RATE_LIMIT"] = "3";
    process.env["PUBLIC_API_ENABLED"] = "true";
    h.record.mockReset();
    mockPrisma.apiKey.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === ID ? { id: ID, organizationId: "org-1", keyHash: hashToken("good"), revokedAt: null, lastUsedAt: new Date() } : null);
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(0);
    mockPrisma.apiMessageMeta.findFirst.mockResolvedValue(null);
    app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    const { publicApiRouter } = await import("./index.js");
    await app.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
  });
  afterEach(async () => {
    await app.close();
    if (ORIG_FLAG === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = ORIG_FLAG;
    delete process.env["PUBLIC_API_RATE_LIMIT"];
  });

  const get = (url: string, authorization = auth()) => app.inject({ method: "GET", url, headers: { authorization } });

  it("records exactly one event per response with the route pattern, attribution and a non-negative integer duration", async () => {
    expect((await get(`/v1/Account/${ID}/Message/`)).statusCode).toBe(200);
    expect(h.record).toHaveBeenCalledTimes(1);
    const e = h.record.mock.calls[0]![0];
    expect(e).toMatchObject({ method: "GET", statusCode: 200, organizationId: "org-1", apiKeyId: ID, messages: 0 });
    expect(e.routeUrl).toBe("/v1/Account/:authId/Message/");
    expect(JSON.stringify(e)).not.toContain(ID + "/");
    expect(Number.isInteger(e.durationMs) && e.durationMs >= 0).toBe(true);
    expect(typeof e.requestId).toBe("string");
  });

  it("uses the pattern for parameterized routes, never the real id", async () => {
    expect((await get(`/v1/Account/${ID}/Message/abc-123/`)).statusCode).toBe(404);
    expect(h.record).toHaveBeenCalledTimes(1);
    const e = h.record.mock.calls[0]![0];
    expect(e.routeUrl).toBe("/v1/Account/:authId/Message/:uuid/");
    expect(e.routeUrl).not.toContain("abc-123");
    expect(e.statusCode).toBe(404);
  });

  it("attributes a wrong token against an existing credential (401) to that credential", async () => {
    expect((await get(`/v1/Account/${ID}/Message/`, auth("bad"))).statusCode).toBe(401);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0]).toMatchObject({ statusCode: 401, organizationId: "org-1", apiKeyId: ID });
  });

  it("leaves an unknown credential unattributed", async () => {
    const other = "22222222-2222-2222-2222-222222222222";
    expect((await get(`/v1/Account/${other}/Message/`, auth("x", other))).statusCode).toBe(401);
    expect(h.record).toHaveBeenCalledTimes(1);
    const e = h.record.mock.calls[0]![0];
    expect(e.statusCode).toBe(401);
    expect(e.organizationId ?? null).toBeNull();
    expect(e.apiKeyId ?? null).toBeNull();
  });

  it("records a 403 (access denied) against the credential, and a 429 from the per-credential limiter", async () => {
    mockPrisma.organization.findUnique.mockResolvedValueOnce({ status: "suspended" });
    expect((await get(`/v1/Account/${ID}/Message/`)).statusCode).toBe(403);
    expect(h.record.mock.calls[0]![0]).toMatchObject({ statusCode: 403, organizationId: "org-1", apiKeyId: ID });
    h.record.mockClear();
    for (let i = 0; i < 3; i++) expect((await get(`/v1/Account/${ID}/Message/`)).statusCode).toBe(200);
    expect((await get(`/v1/Account/${ID}/Message/`)).statusCode).toBe(429);
    expect(h.record).toHaveBeenCalledTimes(4);
    expect(h.record.mock.calls[3]![0]).toMatchObject({ statusCode: 429, organizationId: "org-1", apiKeyId: ID });
  });

  it("records a 500 from an unexpected failure", async () => {
    mockPrisma.apiMessageMeta.findMany.mockRejectedValueOnce(new Error("boom +14155552671"));
    expect((await get(`/v1/Account/${ID}/Message/`)).statusCode).toBe(500);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0]).toMatchObject({ statusCode: 500, organizationId: "org-1" });
  });

  it("the hook function never throws when recording throws (the response is already sent when onResponse runs)", async () => {
    const { recordUsageOnResponse } = await import("./index.js");
    h.record.mockImplementation(() => { throw new Error("recorder down"); });
    const request = { method: "GET", routeOptions: { url: "/x" }, id: "r1", publicApi: { organizationId: "o", apiKeyId: "k" } };
    const reply = { statusCode: 200, elapsedTime: 3.2 };
    expect(() => recordUsageOnResponse(request as never, reply as never)).not.toThrow();
    expect(h.record).toHaveBeenCalledTimes(1);
    // even a request object that explodes on property access must not escape
    const hostile = new Proxy({}, { get() { throw new Error("boom"); } });
    expect(() => recordUsageOnResponse(hostile as never, reply as never)).not.toThrow();
    // and a throwing recorder does not change the real response
    expect((await get(`/v1/Account/${ID}/Message/`)).statusCode).toBe(200);
  });

  it("passes the raw request id through; sanitising happens in recordApiRequest", async () => {
    await app.inject({ method: "GET", url: `/v1/Account/${ID}/Message/`, headers: { authorization: auth(), "request-id": "x y z" } });
    expect(h.record.mock.calls[0]![0].requestId).toBe("x y z");
  });

  describe("payload logging", () => {
    const ORIG = process.env["API_PAYLOAD_LOGGING_ENABLED"];
    afterEach(() => {
      snapshotThrows.on = false;
      if (ORIG === undefined) delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; else process.env["API_PAYLOAD_LOGGING_ENABLED"] = ORIG;
    });

    it("flag on: the event carries logId == response api_id and a payload whose responseBody contains it", async () => {
      process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
      const res = await get(`/v1/Account/${ID}/Message/abc-123/?token=s3cret&limit=5`);
      const apiId = res.json().api_id as string;
      expect(apiId).toMatch(/^[0-9a-f-]{36}$/);
      const e = h.record.mock.calls[0]![0];
      expect(e.logId).toBe(apiId);
      expect(e.payload.responseBody).toContain(apiId);
      expect(e.payload.queryString).toBe("token=[redacted]&limit=5");
      expect(JSON.stringify(e)).not.toMatch(/Basic |authorization/i);
    });

    it("flag on but unauthenticated (no organization): logId is set, no payload is built", async () => {
      process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
      const other = "22222222-2222-2222-2222-222222222222";
      const res = await get(`/v1/Account/${other}/Message/`, auth("x", other));
      expect(res.statusCode).toBe(401);
      const e = h.record.mock.calls[0]![0];
      expect(e.logId).toBe(res.json().api_id);
      expect(e).not.toHaveProperty("payload");
    });

    it("attributed 401 (wrong token, real credential): the snapshot is not even built", async () => {
      process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
      snapshotThrows.calls = 0;
      const res = await get(`/v1/Account/${ID}/Message/`, auth("wrong"));
      expect(res.statusCode).toBe(401);
      expect(h.record.mock.calls[0]![0]).toMatchObject({ statusCode: 401, organizationId: "org-1" });
      expect(h.record.mock.calls[0]![0]).not.toHaveProperty("payload");
      expect(snapshotThrows.calls).toBe(0);
    });

    it("flag unset: no payload, but the event still has logId", async () => {
      delete process.env["API_PAYLOAD_LOGGING_ENABLED"];
      const res = await get(`/v1/Account/${ID}/Message/`);
      const e = h.record.mock.calls[0]![0];
      expect(e).not.toHaveProperty("payload");
      expect(e.logId).toBe(res.json().api_id);
    });

    it("a throwing snapshot builder still yields the normal response, and the event is still recorded (without payload)", async () => {
      process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
      snapshotThrows.on = true;
      const res = await get(`/v1/Account/${ID}/Message/`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("api_id");
      expect(h.record).toHaveBeenCalledTimes(1);
      expect(h.record.mock.calls[0]![0]).toMatchObject({ statusCode: 200, organizationId: "org-1" });
      expect(h.record.mock.calls[0]![0]).not.toHaveProperty("payload");
    });
  });
});
