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

  it("uses empty permissions when no role defaults and no member permissions", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(res.statusCode).toBe(200);
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
});
