import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";
import type { Organization } from "@prisma/client";

const mockOrg = {
  id: "org_123",
  name: "Acme Corp",
  planTier: "starter",
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(mockOrg),
      findUnique: vi.fn().mockResolvedValue({ settings: {} }),
      update: vi.fn().mockResolvedValue({ ...mockOrg, name: "Updated Corp" }),
    },
    $disconnect: vi.fn(),
  },
}));

describe("organizations routes", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("../plugins/prisma.js")).default;
    const { organizationRoutes } = await import("./organizations.js");
    await app.register(prismaPlugin);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_123", organizationId: "org_123", role: "admin", permissions: {}, teamId: null, teamRole: null };
    });
    await app.register(organizationRoutes, { prefix: "/v1" });
    await app.ready();
  });

  afterAll(() => app.close());

  it("GET /v1/organizations/me returns current org", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/organizations/me" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { id: string } }).data.id).toBe("org_123");
  });

  it("GET /v1/organizations/me selects fields without wabaAccessToken or stripeId", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await app.inject({ method: "GET", url: "/v1/organizations/me" });
    const call = vi.mocked(prisma.organization.findUniqueOrThrow).mock.calls.at(-1)![0] as { select?: Record<string, boolean> };
    expect(call.select).toBeDefined();
    expect(call.select).not.toHaveProperty("wabaAccessToken");
    expect(call.select).not.toHaveProperty("stripeId");
    expect(call.select!["id"]).toBe(true);
  });

  describe("isParent / hasParent flags", () => {
    type OrgFlags = { isParent: boolean; hasParent: boolean };
    async function getMe(row: Record<string, unknown>): Promise<Record<string, unknown>> {
      const { prisma } = await import("../lib/prisma.js");
      vi.mocked(prisma.organization.findUniqueOrThrow).mockResolvedValueOnce({ ...mockOrg, ...row } as unknown as Organization);
      const res = await app.inject({ method: "GET", url: "/v1/organizations/me" });
      return (res.json() as { data: Record<string, unknown> }).data;
    }
    it("isParent is true only for a top-level org with the parent capability", async () => {
      const data = await getMe({ isParent: true, parentOrganizationId: null }) as unknown as OrgFlags;
      expect(data.isParent).toBe(true);
      expect(data.hasParent).toBe(false);
    });

    it("hasParent is true for a child org, and a child is never a parent", async () => {
      const data = await getMe({ isParent: true, parentOrganizationId: "org_parent" }) as unknown as OrgFlags;
      expect(data.isParent).toBe(false);
      expect(data.hasParent).toBe(true);
    });

    it("both flags are false for an ordinary org (no capability, no parent)", async () => {
      const data = await getMe({ isParent: false, parentOrganizationId: null }) as unknown as OrgFlags;
      expect(data.isParent).toBe(false);
      expect(data.hasParent).toBe(false);
    });

    it("does not leak the parent's id", async () => {
      const data = await getMe({ isParent: false, parentOrganizationId: "org_parent" });
      expect(data).not.toHaveProperty("parentOrganizationId");
    });
  });

  it("PATCH /v1/organizations/me updates org name", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/organizations/me",
      payload: { name: "Updated Corp" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { name: string } }).data.name).toBe("Updated Corp");
  });

  it("PATCH /v1/organizations/me never selects wabaAccessToken or stripeId on the update", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await app.inject({ method: "PATCH", url: "/v1/organizations/me", payload: { name: "Updated Corp" } });
    const call = vi.mocked(prisma.organization.update).mock.calls.at(-1)![0] as { select?: Record<string, boolean> };
    expect(call.select).toBeDefined();
    expect(call.select).not.toHaveProperty("wabaAccessToken");
    expect(call.select).not.toHaveProperty("stripeId");
    expect(call.select!["id"]).toBe(true);
  });

  it("deep-merges nested settings.contactConfig (no sibling-key data loss)", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      settings: { contactConfig: { defaultLeadStatusId: "ls-1", closureDeadlineDays: 7 } },
    } as unknown as Organization);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/organizations/me",
      payload: { settings: { contactConfig: { assignmentFallbackEnabled: true } } },
    });
    expect(res.statusCode).toBe(200);
    const updateArg = vi.mocked(prisma.organization.update).mock.calls.at(-1)![0] as unknown as { data: { settings: { contactConfig: Record<string, unknown> } } };
    expect(updateArg.data.settings.contactConfig).toEqual({
      defaultLeadStatusId: "ls-1",
      closureDeadlineDays: 7,
      assignmentFallbackEnabled: true,
    });
  });
});

describe("POST /v1/organizations/branding/logo", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("../plugins/prisma.js")).default;
    const { organizationRoutes } = await import("./organizations.js");
    await app.register(prismaPlugin);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_123", organizationId: "org_123", role: "admin", permissions: {}, teamId: null, teamRole: null };
    });
    await app.register(organizationRoutes, { prefix: "/v1" });
    await app.ready();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    process.env["R2_PUBLIC_URL"] = "https://pub.test-r2.dev";
  });

  it("updates org logoImage field with provided URL", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.organization.update).mockResolvedValueOnce({
      id: "org_123",
      logoImage: "https://pub.test-r2.dev/brand/org_123/logo.png",
    } as unknown as Organization);

    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations/branding/logo",
      payload: { url: "https://pub.test-r2.dev/brand/org_123/logo.png" },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { logoImage: "https://pub.test-r2.dev/brand/org_123/logo.png" } })
    );
  });

  it("rejects a URL that is not an allowed R2 asset URL with 400 and does not write", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.organization.update).mockClear();
    for (const url of ["https://evil.example.com/logo.png", "javascript:alert(1)", "https://pub.test-r2.dev/x.svg", ""]) {
      const res = await app.inject({ method: "POST", url: "/v1/organizations/branding/logo", payload: { url } });
      expect(res.statusCode).toBe(400);
    }
    const tooLong = await app.inject({
      method: "POST",
      url: "/v1/organizations/branding/logo",
      payload: { url: "https://pub.test-r2.dev/" + "a".repeat(2100) + ".png" },
    });
    expect(tooLong.statusCode).toBe(400);
    const missing = await app.inject({ method: "POST", url: "/v1/organizations/branding/logo", payload: {} });
    expect(missing.statusCode).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("branding updates never select wabaAccessToken or stripeId", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await app.inject({ method: "POST", url: "/v1/organizations/branding/favicon", payload: { url: "https://pub.test-r2.dev/brand/org_123/f.png" } });
    const call = vi.mocked(prisma.organization.update).mock.calls.at(-1)![0] as { select?: Record<string, boolean> };
    expect(call.select).toBeDefined();
    expect(call.select).not.toHaveProperty("wabaAccessToken");
    expect(call.select).not.toHaveProperty("stripeId");
  });
});

describe("PATCH /v1/organizations/me business profile", () => {
  const build = async (role: string) => {
    const app = Fastify({ logger: false });
    const prismaPlugin = (await import("../plugins/prisma.js")).default;
    const { organizationRoutes } = await import("./organizations.js");
    await app.register(prismaPlugin);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_123", organizationId: "org_123", role, permissions: {}, teamId: null, teamRole: null } as typeof req.auth;
    });
    await app.register(organizationRoutes, { prefix: "/v1" });
    await app.ready();
    return app;
  };

  const lastData = async () => {
    const { prisma } = await import("../lib/prisma.js");
    return (vi.mocked(prisma.organization.update).mock.calls.at(-1)![0] as unknown as { where: { id: string }; data: Record<string, unknown> });
  };

  it("saves profile fields scoped to the caller's org, trimming and normalising", async () => {
    const app = await build("admin");
    const res = await app.inject({ method: "PATCH", url: "/v1/organizations/me", payload: { phone: " +91 98765 43210 ", website: "example.com", location: "Mumbai", industry: "Retail", subCategory: "Fashion" } });
    expect(res.statusCode).toBe(200);
    const call = await lastData();
    expect(call.where.id).toBe("org_123");
    expect(call.data).toMatchObject({ phone: "+91 98765 43210", website: "https://example.com", location: "Mumbai", industry: "Retail", subCategory: "Fashion" });
    await app.close();
  });

  it("stores an empty string as null", async () => {
    const app = await build("manager");
    const res = await app.inject({ method: "PATCH", url: "/v1/organizations/me", payload: { location: "  ", website: "" } });
    expect(res.statusCode).toBe(200);
    expect((await lastData()).data).toMatchObject({ location: null, website: null });
    await app.close();
  });

  it.each([
    ["javascript url", { website: "javascript:alert(1)" }],
    ["ftp url", { website: "ftp://example.com" }],
    ["bad phone", { phone: "call me maybe" }],
    ["too-long industry", { industry: "x".repeat(300) }],
  ])("rejects %s with 400", async (_n, payload) => {
    const app = await build("admin");
    const res = await app.inject({ method: "PATCH", url: "/v1/organizations/me", payload });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("ignores connection-managed and secret fields (stripped, never written)", async () => {
    const app = await build("admin");
    const res = await app.inject({ method: "PATCH", url: "/v1/organizations/me", payload: { industry: "Retail", facebookPageId: "123", wabaAccessToken: "x", planTier: "pro" } });
    expect(res.statusCode).toBe(200);
    const data = (await lastData()).data;
    expect(data).not.toHaveProperty("facebookPageId");
    expect(data).not.toHaveProperty("wabaAccessToken");
    expect(data).not.toHaveProperty("planTier");
    await app.close();
  });

  it("forbids agents", async () => {
    const app = await build("agent");
    const res = await app.inject({ method: "PATCH", url: "/v1/organizations/me", payload: { industry: "Retail" } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
