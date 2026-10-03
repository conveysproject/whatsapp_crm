import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

vi.mock("../lib/clerk.js", () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: "user_123",
    organizationId: "org_123",
  }),
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
    const { verifyClerkToken } = await import("../lib/clerk.js");
    vi.mocked(verifyClerkToken).mockRejectedValueOnce(new Error("Missing Authorization header"));
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
      key === "impersonate:tok" && payload ? JSON.stringify(payload) : null) as never);
  }

  it("resolves the target user's role, permissions and team, and sets impersonation", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await mockToken({ organizationId: "org-1", targetUserId: "user-9", issuedBy: "sa-1", mode: "readonly" });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1", teamId: "t-1", teamRole: "member" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce({ permissions: { inbox_access: "allow" } } as never);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({ value: JSON.stringify({ contacts_access: "allow" }) } as never);

    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      auth: {
        userId: "user-9",
        organizationId: "org-1",
        role: "agent",
        permissions: { contacts_access: "allow", inbox_access: "allow" },
        teamId: "t-1",
        teamRole: "member",
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
    await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok" } });
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
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok" } });
    expect(res.json<{ auth: { impersonation: unknown } }>().auth.impersonation).toEqual({ adminId: "sa-1", mode: "edit" });
    await app.close();
  });

  it("rejects old-format tokens without targetUserId with 401", async () => {
    await mockToken({ organizationId: "org-1", orgName: "Acme", issuedBy: "sa-1" });
    const app = await buildImpApp();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
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
    const res = await app.inject({ method: "GET", url: "/probe", headers: { "x-impersonate-token": "tok" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_IMPERSONATION_TOKEN");
    await app.close();
  });
});
