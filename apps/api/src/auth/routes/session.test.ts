import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  verifyAccessToken: vi.fn(),
  store: new Map<string, string>(),
}));
vi.mock("../limits.js", () => ({ hitLimit: m.hitLimit, authClientIp: () => "9.9.9.9" }));
vi.mock("../tokens.js", () => ({
  verifyAccessToken: m.verifyAccessToken,
  signAccessToken: vi.fn().mockResolvedValue("AT-new"),
}));
vi.mock("../../lib/redis.js", () => ({
  redis: {
    get: vi.fn(async (k: string) => m.store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      m.store.set(k, String(v));
      return "OK";
    }),
    setex: vi.fn(async (k: string, _t: number, v: string) => {
      m.store.set(k, String(v));
      return "OK";
    }),
    exists: vi.fn(async (k: string) => (m.store.has(k) ? 1 : 0)),
    del: vi.fn(async () => 1),
  },
}));

import authPlugin from "../../plugins/auth.js";
import { authRouter } from "./index.js";

const prisma = {
  authSession: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  user: { findFirst: vi.fn(), updateMany: vi.fn() },
  organizationMember: { findFirst: vi.fn() },
  vendorSetting: { findUnique: vi.fn() },
  $transaction: vi.fn(),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error" } });
  app.decorate("prisma", prisma as any);
  await app.register(authPlugin);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const AUTHZ = { authorization: "Bearer good" };
const EXPIRED = { error: { code: "SESSION_EXPIRED", message: "Please sign in again." } };
const NO_SESSION = { error: { code: "NO_SESSION", message: "This action needs a WBMSG session." } };
const AUTHED_ROUTES = [
  ["POST", "/v1/auth/signout"],
  ["GET", "/v1/auth/sessions"],
  ["DELETE", "/v1/auth/sessions/abc"],
  ["POST", "/v1/auth/sessions/revoke-all"],
] as const;

describe("auth session routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    m.store.clear();
    process.env.AUTH_PROVIDER = "wbmsg";
    m.hitLimit.mockResolvedValue(false);
    m.verifyAccessToken.mockResolvedValue({ sub: "usr_a", sid: "s1", typ: "user" });
    prisma.user.findFirst.mockResolvedValue({ role: "admin", organizationId: "org1", teamId: null, teamRole: null });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizationMember.findFirst.mockResolvedValue(null);
    prisma.vendorSetting.findUnique.mockResolvedValue(null);
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.findMany.mockResolvedValue([]);
    app = await build();
  });
  afterEach(async () => {
    delete process.env.AUTH_PROVIDER;
    await app.close();
  });

  describe("POST /refresh", () => {
    it("rotates and returns a new pair (public, no bearer)", async () => {
      prisma.authSession.findUnique.mockResolvedValue({
        id: "s1",
        accountId: "usr_a",
        client: "web",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e9),
      });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
      const res = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "old" } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBe("AT-new");
      expect(typeof body.refreshToken).toBe("string");
      expect(body.refreshToken).not.toBe("old");
      expect(body.expiresIn).toBe(600);
    });

    it("reused token -> 401 SESSION_EXPIRED and the family is revoked", async () => {
      prisma.authSession.findUnique.mockResolvedValue(null);
      prisma.authSession.findFirst.mockResolvedValue({
        id: "s1",
        accountId: "usr_a",
        client: "web",
        familyId: "fam1",
        revokedAt: null,
        rotatedAt: new Date(Date.now() - 3600_000),
      });
      prisma.authSession.findMany.mockResolvedValue([{ id: "s1" }]);
      const res = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "stolen" } });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual(EXPIRED);
      expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "fam1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "reuse_detected" }),
        }),
      );
      expect(m.store.get("auth:revoked:s1")).toBe("1");
    });

    it("unknown and expired tokens give the identical 401 body", async () => {
      prisma.authSession.findUnique.mockResolvedValueOnce(null);
      prisma.authSession.findFirst.mockResolvedValueOnce(null);
      const a = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "nope" } });
      prisma.authSession.findUnique.mockResolvedValueOnce({
        id: "s2",
        accountId: "usr_a",
        client: "web",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      const b = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "old" } });
      expect(a.statusCode).toBe(401);
      expect(b.statusCode).toBe(401);
      expect(a.json()).toEqual(EXPIRED);
      expect(b.json()).toEqual(EXPIRED);
    });

    it("answers 503 UNAVAILABLE (not a sign-out) when the store throws", async () => {
      prisma.authSession.findUnique.mockRejectedValue(new Error("db down"));
      const res = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "x" } });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: { code: "UNAVAILABLE", message: "Please try again." } });
    });

    it("rejects a malformed body with 400", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it("uses its own per-IP limit (300/10 min), not the 20/10 min one", async () => {
      prisma.authSession.findUnique.mockResolvedValue(null);
      prisma.authSession.findFirst.mockResolvedValue(null);
      await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "x" } });
      expect(m.hitLimit).toHaveBeenCalledWith("auth:ipr:9.9.9.9", 300, 600);
      expect(m.hitLimit).not.toHaveBeenCalledWith("auth:ip:9.9.9.9", 20, 600);
    });

    it("answers 429 when the refresh limit is exceeded", async () => {
      m.hitLimit.mockResolvedValue(true);
      const res = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: "x" } });
      expect(res.statusCode).toBe(429);
    });
  });

  describe("authenticated routes", () => {
    it("require a bearer token", async () => {
      for (const [method, url] of AUTHED_ROUTES) {
        const res = await app.inject({ method, url });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    });

    it("do not consume the 20/10 min credential IP limit", async () => {
      await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: AUTHZ });
      expect(m.hitLimit).not.toHaveBeenCalled();
    });

    it("answer 400 NO_SESSION when the context has no sid", async () => {
      m.verifyAccessToken.mockResolvedValue({ sub: "usr_a", sid: null, typ: "user" });
      for (const [method, url] of AUTHED_ROUTES) {
        const res = await app.inject({ method, url, headers: AUTHZ });
        expect(res.statusCode, `${method} ${url}`).toBe(400);
        expect(res.json()).toEqual(NO_SESSION);
      }
    });
  });

  describe("impersonation context", () => {
    it("answers 400 NO_SESSION on every authenticated session route", async () => {
      m.verifyAccessToken.mockResolvedValue({ sub: "adm1", sid: "as1", typ: "admin" });
      m.store.set(
        "impersonate:tok",
        JSON.stringify({ organizationId: "org1", targetUserId: "usr_t", issuedBy: "adm1", issuedSid: "as1" }),
      );
      for (const [method, url] of AUTHED_ROUTES) {
        const res = await app.inject({ method, url, headers: { ...AUTHZ, "x-impersonate-token": "tok" } });
        expect(res.statusCode, `${method} ${url}`).toBe(400);
        expect(res.json()).toEqual(NO_SESSION);
      }
      expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /signout", () => {
    it("revokes the current session and the plugin rejects the same token on the next request", async () => {
      const ok = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: AUTHZ });
      expect(ok.statusCode).toBe(200);

      const out = await app.inject({ method: "POST", url: "/v1/auth/signout", headers: AUTHZ });
      expect(out.statusCode).toBe(200);
      expect(out.json()).toEqual({ ok: true });
      expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "signout" }),
        }),
      );

      const after = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: AUTHZ });
      expect(after.statusCode).toBe(401);
    });
  });

  describe("GET /sessions", () => {
    it("lists only the caller's live sessions with exact fields and current flag", async () => {
      const t1 = new Date("2026-10-17T10:00:00Z");
      const t2 = new Date("2026-10-16T10:00:00Z");
      prisma.authSession.findMany.mockResolvedValue([
        { id: "s1", client: "web", deviceLabel: null, ip: "1.1.1.1", lastUsedAt: t1 },
        { id: "s2", client: "mobile", deviceLabel: "iPhone", ip: "2.2.2.2", lastUsedAt: t2 },
      ]);
      const res = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: AUTHZ });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: [
          { id: "s1", client: "web", deviceLabel: null, ip: "1.1.1.1", lastUsedAt: t1.toISOString(), current: true },
          { id: "s2", client: "mobile", deviceLabel: "iPhone", ip: "2.2.2.2", lastUsedAt: t2.toISOString(), current: false },
        ],
      });
      const arg = prisma.authSession.findMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ accountId: "usr_a", revokedAt: null, expiresAt: { gt: expect.any(Date) } });
      expect(arg.orderBy).toEqual({ lastUsedAt: "desc" });
      expect(arg.select).toEqual({ id: true, client: true, deviceLabel: true, ip: true, lastUsedAt: true });
    });
  });

  describe("DELETE /sessions/:id", () => {
    it("404 for a session that is not the caller's (ownership check) and revokes nothing", async () => {
      prisma.authSession.findFirst.mockResolvedValue(null);
      const res = await app.inject({ method: "DELETE", url: "/v1/auth/sessions/other", headers: AUTHZ });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Session not found" } });
      expect(prisma.authSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "other", accountId: "usr_a", revokedAt: null } }),
      );
      expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    });

    it("revokes an owned session with reason user_revoked", async () => {
      prisma.authSession.findFirst.mockResolvedValue({ id: "s2" });
      const res = await app.inject({ method: "DELETE", url: "/v1/auth/sessions/s2", headers: AUTHZ });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "s2", revokedAt: null }, data: expect.objectContaining({ revokedReason: "user_revoked" }) }),
      );
      expect(m.store.get("auth:revoked:s2")).toBe("1");
    });

    it("allows deleting the current session (same as sign-out)", async () => {
      prisma.authSession.findFirst.mockResolvedValue({ id: "s1" });
      const res = await app.inject({ method: "DELETE", url: "/v1/auth/sessions/s1", headers: AUTHZ });
      expect(res.statusCode).toBe(200);
      expect(m.store.get("auth:revoked:s1")).toBe("1");
    });
  });

  describe("POST /sessions/revoke-all", () => {
    it("revokes all but the current session and returns the count", async () => {
      prisma.authSession.findMany.mockResolvedValue([{ id: "s2" }, { id: "s3" }]);
      prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
      const res = await app.inject({ method: "POST", url: "/v1/auth/sessions/revoke-all", headers: AUTHZ });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ revoked: 2 });
      expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: "usr_a", revokedAt: null, id: { not: "s1" } },
          data: expect.objectContaining({ revokedReason: "user_revoked_all" }),
        }),
      );
      expect(m.store.get("auth:revoked:s1")).toBeUndefined();
      expect(m.store.get("auth:revoked:s2")).toBe("1");
    });
  });
});
