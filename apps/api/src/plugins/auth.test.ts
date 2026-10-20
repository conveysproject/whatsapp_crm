import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";

vi.mock("../auth/tokens.js", () => ({
  verifyAccessToken: vi.fn().mockResolvedValue({ sub: "user_123", sid: "sid-1", typ: "user" }),
}));

vi.mock("../auth/sessions.js", () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: "admin", organizationId: "org_123" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue({ permissions: {} }),
    },
    vendorSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    loginLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
    // exists returns truthy so the lastSignInAt stamping block is skipped
    // (avoids needing a user.updateMany mock for the fire-and-forget stamp).
    exists: vi.fn().mockResolvedValue(1),
  },
}));

describe("auth plugin", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/protected", async (req) => ({ userId: req.auth.userId }));
    app.get("/public", { config: { public: true } }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(() => app.close());

  it("sets request.auth on valid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer valid" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { userId: string }).userId).toBe("user_123");
  });

  it("skips auth for public routes", async () => {
    const res = await app.inject({ method: "GET", url: "/public" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when token is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });
});

describe("auth plugin — permission merge", () => {
  async function buildMergeApp() {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/probe", async (req) => ({
      permissions: req.auth.permissions,
    }));
    await app.ready();
    return app;
  }

  it("falls back to DEFAULT_ROLE_PERMISSIONS when no role_permissions row exists", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { defaultsForRole } = await import("../lib/default-role-permissions.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null); // row ABSENT

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(res.statusCode).toBe(200);
    // Absent row → built-in agent defaults, NOT an empty (open-everything) object.
    expect(res.json<{ permissions: Record<string, string> }>().permissions).toEqual(defaultsForRole("agent"));
    await app.close();
  });

  it("whatsappAdmin always resolves to its fixed defaults, ignoring stored row and member overrides", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { defaultsForRole } = await import("../lib/default-role-permissions.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "whatsappAdmin", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce({ permissions: { contacts_access: "allow" } } as never);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({ value: JSON.stringify({ inbox_access: "allow" }) } as never);

    const app = await buildMergeApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer tok" } });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ permissions: Record<string, string> }>().permissions).toEqual(defaultsForRole("whatsappAdmin"));
    await app.close();
  });

  it("uses the stored config exactly when the row exists, even if empty (deny all)", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({ value: "{}" } as never); // row PRESENT, empty

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(res.statusCode).toBe(200);
    // Present empty row → deny all (no fallback to defaults).
    expect(res.json<{ permissions: Record<string, string> }>().permissions).toEqual({});
    await app.close();
  });

  it("uses role defaults when member has no individual overrides", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({
      value: JSON.stringify({ inbox_access: "allow", contacts_access: "allow" }),
    } as never);

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(res.json<{ permissions: Record<string, string> }>().permissions).toEqual({
      inbox_access: "allow",
      contacts_access: "allow",
    });
    await app.close();
  });

  it("per-user override wins over role default on conflict", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce({
      permissions: { contacts_access: "deny" },
    } as never);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({
      value: JSON.stringify({ inbox_access: "allow", contacts_access: "allow" }),
    } as never);

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    const { permissions } = res.json<{ permissions: Record<string, string> }>();
    expect(permissions["contacts_access"]).toBe("deny");  // override wins
    expect(permissions["inbox_access"]).toBe("allow");    // role default preserved
    await app.close();
  });

  it("queries vendorSetting with correct org and role key", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "manager", organizationId: "org-42" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);

    const app = await buildMergeApp();
    await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(vi.mocked(prisma.vendorSetting.findUnique)).toHaveBeenCalledWith({
      where: {
        organizationId_key: { organizationId: "org-42", key: "role_permissions_manager" },
      },
      select: { value: true },
    });
    await app.close();
  });

  it("populates teamId and teamRole on auth context", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      role: "agent",
      organizationId: "org-1",
      teamId: "team-1",
      teamRole: "lead",
    } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);

    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const teamApp = Fastify({ logger: false });
    await teamApp.register(prismaPlugin);
    await teamApp.register(authPlugin);
    let capturedAuth: Record<string, unknown> = {};
    teamApp.get("/team-probe", async (req) => {
      capturedAuth = req.auth as unknown as Record<string, unknown>;
      return { ok: true };
    });
    await teamApp.ready();

    await teamApp.inject({
      method: "GET",
      url: "/team-probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(capturedAuth["teamId"]).toBe("team-1");
    expect(capturedAuth["teamRole"]).toBe("lead");
    await teamApp.close();
  });
});

describe("auth plugin — user impersonation", () => {
  beforeEach(async () => {
    const { verifyAccessToken } = await import("../auth/tokens.js");
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "sa-1", sid: "sid-A", typ: "admin" });
  });
  afterAll(async () => {
    const { verifyAccessToken } = await import("../auth/tokens.js");
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "user_123", sid: "sid-1", typ: "user" });
  });

  it("rejects with 401 when the bearer user differs from issuedBy", async () => {
    const { verifyAccessToken } = await import("../auth/tokens.js");
    vi.mocked(verifyAccessToken).mockResolvedValueOnce({ sub: "someone-else", sid: "sid-A", typ: "admin" });
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "readonly" });
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok", authorization: "Bearer x" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
    await app.close();
  });

  it("rejects with 401 when the bearer is missing/invalid", async () => {
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "readonly" });
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
    await app.close();
  });

  it("demo tokens are exempt from the bearer check but cannot reach /v1/admin", async () => {
    await mockToken({ organizationId: "demo-org", orgName: "Demo Account", isDemo: true });
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/v1/admin/organizations", async () => ({ ok: true }));
    app.post("/v1/admin/organizations/:id/impersonate", async () => ({ ok: true }));
    app.get("/v1/contacts", async (req) => ({ org: req.auth.organizationId }));
    app.get("/v1/super-admins", async () => ({ ok: true }));
    app.post("/v1/billing/manual/:id/approve", async () => ({ ok: true }));
    await app.ready();
    const h = { "x-impersonate-token": "tok" };
    expect((await app.inject({ method: "GET", url: "/v1/contacts", headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/super-admins", headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/billing/manual/ms-1/approve", headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/%61dmin/organizations", headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/V1/ADMIN/organizations", headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/admin/organizations?x=1", headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/admin/organizations/o/impersonate", headers: h })).statusCode).toBe(403);
    await app.close();
  });

  async function buildImpApp() {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/probe", async (req) => ({ auth: req.auth }));
    await app.ready();
    return app;
  }

  async function mockToken(payload: Record<string, unknown> | null) {
    const { redis } = await import("../lib/redis.js");
    vi.mocked(redis.get).mockImplementation((async (key: string) =>
      key === "impersonate:tok" && payload ? JSON.stringify({ issuedSid: "sid-A", ...payload }) : null) as never);
  }

  it("resolves the target user's role, permissions and team, and sets impersonation", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "readonly" });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: "t-1", teamRole: "member" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce({ permissions: { inbox_access: "allow" } } as never);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({ value: JSON.stringify({ contacts_access: "allow" }) } as never);

    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      auth: {
        userId: "user-9",
        organizationId: "org-1",
        role: "agent",
        permissions: { contacts_access: "allow", inbox_access: "allow" },
        teamId: "t-1",
        teamRole: "member",
        sid: null,
        impersonation: { adminId: "sa-1", mode: "readonly" },
      },
    });
    expect(vi.mocked(prisma.user.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-9", organizationId: "org-1", isActive: true, deletedAt: null } })
    );
    await app.close();
  });

  it("does not stamp lastSignInAt or touch the sign-in stamp key", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { redis } = await import("../lib/redis.js");
    vi.mocked(prisma.user.updateMany).mockClear();
    vi.mocked(redis.exists).mockClear();
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "readonly" });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);

    const app = await buildImpApp();
    await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(redis.exists).not.toHaveBeenCalled();
    await app.close();
  });

  it("propagates edit mode", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "edit" });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.json<{ auth: { impersonation: unknown } }>().auth.impersonation).toEqual({ adminId: "sa-1", mode: "edit" });
    await app.close();
  });

  it("a revoked token (key deleted from Redis) gives 401 immediately", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { redis } = await import("../lib/redis.js");
    const payload = JSON.stringify({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", issuedSid: "sid-A", mode: "edit" });
    const store = new Map<string, string>([["impersonate:tok", payload]]);
    vi.mocked(redis.get).mockImplementation((async (k: string) => store.get(k) ?? null) as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValue(null);
    const app = await buildImpApp();
    try {
      expect((await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } })).statusCode).toBe(200);
      store.delete("impersonate:tok"); // what DELETE .../impersonate does
      const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
      expect(res.statusCode).toBe(401);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
    } finally {
      vi.mocked(redis.get).mockReset();
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockReset();
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ role: "admin", organizationId: "org_123" } as never);
      vi.mocked(prisma.organizationMember.findFirst).mockReset();
      vi.mocked(prisma.organizationMember.findFirst).mockResolvedValue({ permissions: {} } as never);
      vi.mocked(prisma.vendorSetting.findUnique).mockReset();
      vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValue(null);
      await app.close();
    }
  });

  it("rejects old-format tokens without targetUserId with 401", async () => {
    await mockToken({ organizationId: "org-1", orgName: "Acme", issuedBy: "sa-1" });
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
    await app.close();
  });

  it("keeps demo tokens (isDemo:true) working as org-scoped superAdmin without impersonation context", async () => {
    await mockToken({ organizationId: "demo-org", orgName: "Demo Account", isDemo: true });
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(200);
    const auth = res.json<{ auth: { role: string; organizationId: string; impersonation?: unknown } }>().auth;
    expect(auth.role).toBe("superAdmin");
    expect(auth.organizationId).toBe("demo-org");
    expect(auth.impersonation).toBeUndefined();
    await app.close();
  });

  it("rejects old org-level payloads that are not isDemo", async () => {
    await mockToken({ organizationId: "org-1", orgName: "Acme", issuedBy: "sa-1", isDemo: false });
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("treats an invalid mode as readonly", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "root" });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.json<{ auth: { impersonation: { mode: string } } }>().auth.impersonation.mode).toBe("readonly");
    await app.close();
  });

  it("rejects unknown tokens with 401", async () => {
    await mockToken(null);
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "nope" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects when the target is no longer active/in the org with 401", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "readonly" });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer x", "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
    await app.close();
  });
});

describe("auth plugin — WBMSG session tokens", () => {
  const OLD = { m: process.env.AUTH_MIN_MOBILE_VERSION };
  beforeEach(async () => {
    delete process.env.AUTH_MIN_MOBILE_VERSION;
    const { verifyAccessToken } = await import("../auth/tokens.js");
    const { isSessionRevoked } = await import("../auth/sessions.js");
    vi.mocked(verifyAccessToken).mockReset().mockResolvedValue({ sub: "user_123", sid: "sid-1", typ: "user" });
    vi.mocked(isSessionRevoked).mockReset().mockResolvedValue(false);
    const { redis } = await import("../lib/redis.js");
    vi.mocked(redis.get).mockReset().mockResolvedValue(null);
  });
  afterAll(() => {
    if (OLD.m === undefined) delete process.env.AUTH_MIN_MOBILE_VERSION; else process.env.AUTH_MIN_MOBILE_VERSION = OLD.m;
  });

  async function buildApp() {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/probe", async (req) => ({ auth: req.auth }));
    app.get("/public", { config: { public: true } }, async () => ({ ok: true }));
    await app.ready();
    return app;
  }
  const bearer = { authorization: "Bearer tok" };

  it("resolves request.auth as before and carries the token sid", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: bearer });
    expect(res.statusCode).toBe(200);
    const auth = res.json<{ auth: { userId: string; organizationId: string; role: string; sid: string } }>().auth;
    expect(auth).toMatchObject({ userId: "user_123", organizationId: "org-1", role: "agent", sid: "sid-1" });
    await app.close();
  });

  it("rejects an invalid token and a revoked session with 401", async () => {
    const { verifyAccessToken } = await import("../auth/tokens.js");
    const { isSessionRevoked } = await import("../auth/sessions.js");
    const app = await buildApp();
    vi.mocked(verifyAccessToken).mockRejectedValueOnce(new Error("bad"));
    expect((await app.inject({ method: "GET", url: "/probe", headers: bearer })).statusCode).toBe(401);
    vi.mocked(isSessionRevoked).mockResolvedValueOnce(true);
    expect((await app.inject({ method: "GET", url: "/probe", headers: bearer })).statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 for a deactivated user", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: bearer });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  describe("impersonation", () => {
    const payload = { organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", issuedSid: "sid-A", mode: "readonly" };
    async function run(claims: { sub: string; sid: string; typ: "user" | "admin" }) {
      const { prisma } = await import("../lib/prisma.js");
      const { redis } = await import("../lib/redis.js");
      const { verifyAccessToken } = await import("../auth/tokens.js");
      vi.mocked(verifyAccessToken).mockResolvedValue(claims);
      vi.mocked(redis.get).mockImplementation((async (k: string) => (k === "impersonate:tok" ? JSON.stringify(payload) : null)) as never);
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: "/probe", headers: { ...bearer, "x-impersonate-token": "tok" } });
      await app.close();
      return res;
    }

    it("accepts the issuing admin session", async () => {
      const res = await run({ sub: "sa-1", sid: "sid-A", typ: "admin" });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ auth: { sid: null } }>().auth.sid).toBeNull();
    });
    it("rejects another session of the same admin", async () => {
      expect((await run({ sub: "sa-1", sid: "sid-B", typ: "admin" })).statusCode).toBe(401);
    });
    it("rejects a non-admin token", async () => {
      expect((await run({ sub: "sa-1", sid: "sid-A", typ: "user" })).statusCode).toBe(401);
    });
  });

  describe("mobile version gate", () => {
    it("426 when mobile sends no version and a minimum is set", async () => {
      process.env.AUTH_MIN_MOBILE_VERSION = "1.2.0";
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: "/probe", headers: { ...bearer, "x-app-client": "mobile" } });
      expect(res.statusCode).toBe(426);
      expect(res.json()).toEqual({ error: { code: "UPGRADE_REQUIRED", message: "Please update the WBMSG app to continue." } });
      await app.close();
    });
    it("426 for a lower version, ok for equal/higher, skipped for public routes and web", async () => {
      process.env.AUTH_MIN_MOBILE_VERSION = "1.2.0";
      const { prisma } = await import("../lib/prisma.js");
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ role: "agent", organizationId: "org-1", teamId: null, teamRole: null } as never);
      const app = await buildApp();
      const h = (v: string) => ({ ...bearer, "x-app-client": "mobile", "x-app-version": v });
      expect((await app.inject({ method: "GET", url: "/probe", headers: h("1.1.9") })).statusCode).toBe(426);
      expect((await app.inject({ method: "GET", url: "/probe", headers: h("1.10.0") })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/probe", headers: h("1.2.0") })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/public", headers: { "x-app-client": "mobile" } })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/probe", headers: bearer })).statusCode).toBe(200);
      await app.close();
    });
  });
});

describe("auth plugin — parent impersonation of a child", () => {
  const goodPayload = {
    organizationId: "c1",
    targetUserId: "cu-1",
    issuedBy: "pu-1",
    issuedSid: "sid-P",
    issuedByOrgId: "p1",
    mode: "readonly",
  };
  type Opts = {
    payload?: Record<string, unknown> | null;
    claims?: { sub: string; sid: string; typ: "user" | "admin" } | null;
    issuer?: { role: string; organizationId: string } | null;
    target?: { role: string } | null;
    childParent?: string | null;
    parentIsParent?: boolean;
    flag?: string;
    parentPerms?: Record<string, string>;
  };
  let orgFindUnique: ReturnType<typeof vi.fn>;
  beforeAll(async () => {
    const { prisma } = await import("../lib/prisma.js");
    orgFindUnique = vi.fn();
    (prisma as unknown as { organization: unknown }).organization = { findUnique: orgFindUnique };
  });
  afterAll(async () => {
    const { verifyAccessToken } = await import("../auth/tokens.js");
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "user_123", sid: "sid-1", typ: "user" });
    delete process.env["PARENT_ORGS_ENABLED"];
  });

  async function run(o: Opts = {}) {
    const { prisma } = await import("../lib/prisma.js");
    const { redis } = await import("../lib/redis.js");
    const { verifyAccessToken } = await import("../auth/tokens.js");
    process.env["PARENT_ORGS_ENABLED"] = o.flag ?? "true";
    const payload = o.payload === undefined ? goodPayload : o.payload;
    vi.mocked(redis.get).mockImplementation((async (k: string) =>
      k === "impersonate:tok" && payload ? JSON.stringify(payload) : null) as never);
    const claims = o.claims === undefined ? { sub: "pu-1", sid: "sid-P", typ: "user" as const } : o.claims;
    if (claims) vi.mocked(verifyAccessToken).mockResolvedValue(claims);
    else vi.mocked(verifyAccessToken).mockRejectedValue(new Error("no bearer"));
    const issuer = o.issuer === undefined ? { role: "admin", organizationId: "p1" } : o.issuer;
    const target = o.target === undefined ? { role: "admin" } : o.target;
    vi.mocked(prisma.user.findFirst).mockImplementation((async (args: { where: { id: string; organizationId?: string } }) => {
      const row = args.where.id === "pu-1" ? issuer : args.where.id === "cu-1" ? target : null;
      if (!row) return null;
      // strict lookups only match inside the named org
      const org = args.where.id === "pu-1" ? (row as unknown as { organizationId: string }).organizationId : "c1";
      if (args.where.organizationId && args.where.organizationId !== org) return null;
      return { teamId: null, teamRole: null, organizationId: org, ...row };
    }) as never);
    orgFindUnique.mockImplementation((async (args: { where: { id: string } }) => {
      if (args.where.id === "p1") return { isParent: o.parentIsParent ?? true, parentOrganizationId: null };
      if (args.where.id === "c1") return { parentOrganizationId: o.childParent === undefined ? "p1" : o.childParent };
      return null;
    }) as never);
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/probe", async (req) => ({ auth: req.auth }));
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { ...(claims ? { authorization: "Bearer x" } : {}), "x-impersonate-token": "tok" },
    });
    await app.close();
    return res;
  }
  const code = (r: { json: () => unknown }) => (r.json() as { error: { code: string } }).error.code;
  const expect401 = (r: { statusCode: number; json: () => unknown }) => {
    expect(r.statusCode).toBe(401);
    expect(code(r)).toBe("INVALID_IMPERSONATION_TOKEN");
  };

  it("accepts the issuing parent admin's own session and marks the parent org", async () => {
    const res = await run();
    expect(res.statusCode).toBe(200);
    const body = res.json<{ auth: { userId: string; organizationId: string; sid: unknown; impersonation: unknown } }>().auth;
    expect(body.userId).toBe("cu-1");
    expect(body.organizationId).toBe("c1");
    expect(body.impersonation).toEqual({ adminId: "pu-1", mode: "readonly", parentOrganizationId: "p1" });
  });

  it("rejects a leaked token used with a different user's session", async () => {
    expect401(await run({ claims: { sub: "pu-2", sid: "sid-P", typ: "user" } }));
  });
  it("rejects another session of the issuer", async () => {
    expect401(await run({ claims: { sub: "pu-1", sid: "sid-other", typ: "user" } }));
  });
  it("rejects a super-admin (typ admin) session, even with the same user and sid", async () => {
    expect401(await run({ claims: { sub: "pu-1", sid: "sid-P", typ: "admin" } }));
  });
  it("rejects a request with no bearer", async () => {
    expect401(await run({ claims: null }));
  });
  it("rejects a parent payload with no issuedSid", async () => {
    expect401(await run({ payload: { ...goodPayload, issuedSid: null } }));
  });
  it("rejects an empty issuedByOrgId", async () => {
    expect401(await run({ payload: { ...goodPayload, issuedByOrgId: "" } }));
  });
  it("stops working once the child is unlinked", async () => {
    expect401(await run({ childParent: null }));
  });
  it("stops working when the child is re-linked under another parent", async () => {
    expect401(await run({ childParent: "p2" }));
  });
  it("stops working when the issuer loses the admin role", async () => {
    expect401(await run({ issuer: { role: "manager", organizationId: "p1" } }));
  });
  it("stops working when the issuer moved to another org", async () => {
    expect401(await run({ issuer: { role: "admin", organizationId: "other-org" } }));
  });
  it("stops working when the issuer is deactivated or deleted", async () => {
    expect401(await run({ issuer: null }));
  });
  it("stops working when the feature flag is turned off", async () => {
    expect401(await run({ flag: "false" }));
  });
  it("stops working when the org is no longer a parent", async () => {
    expect401(await run({ parentIsParent: false }));
  });
  it("still rejects a superAdmin target and a target that left the child org", async () => {
    expect401(await run({ target: { role: "superAdmin" } }));
    expect401(await run({ target: null }));
  });
  it("super-admin payloads (no issuedByOrgId) keep the super-admin rules: a normal user session is refused", async () => {
    const saPayload: Record<string, unknown> = { ...goodPayload };
    delete saPayload["issuedByOrgId"];
    expect401(await run({ payload: saPayload }));
  });
});
