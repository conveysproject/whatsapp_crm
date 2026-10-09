import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { hashToken } from "../../lib/public-api/credentials.js";
import { publicApiAuth } from "./auth.js";

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
};

const ID = "11111111-1111-1111-1111-111111111111";
const basic = (id: string, token: string) => `Basic ${Buffer.from(`${id}:${token}`).toString("base64")}`;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  await app.register(async (f) => {
    f.addHook("preHandler", publicApiAuth);
    f.get("/ping", async (req) => req.publicApi);
  }, { prefix: "/v1/Account/:authId" });
  return app;
}

const ORIG_FLAG = process.env["PUBLIC_API_ENABLED"];

describe("publicApiAuth", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: ID, organizationId: "org-1", keyHash: hashToken("good-token"), revokedAt: null, lastUsedAt: null });
    mockPrisma.apiKey.update.mockResolvedValue({});
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active" });
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    process.env["PUBLIC_API_ENABLED"] = "true";
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null); // no kill switch, no plan setting
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close(); delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    if (ORIG_FLAG === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = ORIG_FLAG;
  });

  const get = (auth?: string, id = ID) =>
    app.inject({ method: "GET", url: `/v1/Account/${id}/ping`, headers: auth ? { authorization: auth } : {} });

  it("accepts valid credentials and exposes the org", async () => {
    const res = await get(basic(ID, "good-token"));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ apiKeyId: ID, organizationId: "org-1" });
  });

  it("401 with no header, wrong token, or garbage header", async () => {
    for (const h of [undefined, basic(ID, "bad"), "Basic !!!", "Bearer x"]) {
      const res = await get(h);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: expect.any(String), api_id: expect.any(String) });
    }
  });

  it("401 when the URL auth id differs from the Basic username (no lookup of the URL id)", async () => {
    const other = "22222222-2222-2222-2222-222222222222";
    const res = await get(basic(ID, "good-token"), other);
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("401 for an unknown or revoked credential", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(401);
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({ id: ID, organizationId: "org-1", keyHash: hashToken("good-token"), revokedAt: new Date(), lastUsedAt: null });
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(401);
  });

  it("403 when the org is not active", async () => {
    mockPrisma.organization.findUnique.mockResolvedValueOnce({ status: "banned" });
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(403);
  });

  it("403 with the Plivo error body and no handler run when the org is blocked or not allow-listed (same body)", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    const blocked = await get(basic(ID, "good-token"));
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    process.env["PUBLIC_API_ALLOWED_ORGS"] = "other-org";
    const notAllowed = await get(basic(ID, "good-token"));
    for (const res of [blocked, notAllowed]) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ api_id: expect.any(String), error: "API access is not available for this account" });
    }
    expect(JSON.parse(blocked.body).error).toBe(JSON.parse(notAllowed.body).error);
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("403 (same Plivo body) when the platform flag PUBLIC_API_ENABLED is off, without a database lookup for access", async () => {
    process.env["PUBLIC_API_ENABLED"] = "false";
    const res = await get(basic(ID, "good-token"));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ api_id: expect.any(String), error: "API access is not available for this account" });
    expect(mockPrisma.vendorSetting.findFirst).not.toHaveBeenCalled();
  });

  it("allows an org with no plan setting at all, and an allow-listed org", async () => {
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(200);
    process.env["PUBLIC_API_ALLOWED_ORGS"] = "org-1";
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(200);
  });
});
