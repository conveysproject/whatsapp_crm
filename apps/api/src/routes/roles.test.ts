import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { rolesRouter } from "./roles.js";

const mockPrisma = {
  vendorSetting: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const mockAuth = {
  userId: "u-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {},
};

async function buildApp(authOverride?: Partial<typeof mockAuth>) {
  const app = Fastify({ logger: false });
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    (request as unknown as { auth: typeof mockAuth }).auth = { ...mockAuth, ...authOverride };
  });
  app.decorate("prisma", mockPrisma);
  await app.register(rolesRouter);
  return app;
}

describe("GET /roles/permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-admin", async () => {
    const app = await buildApp({ role: "agent" as const });
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(403);
  });

  it("returns empty objects for roles with no stored settings", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    expect(body.data.admin).toEqual({});
    expect(body.data.agent).toEqual({});
    expect(body.data.viewer).toEqual({});
    expect(body.data.manager).toEqual({});
    expect(body.data.superAdmin).toEqual({});
  });

  it("returns stored permissions for each role", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "role_permissions_admin", value: JSON.stringify({ contacts_access: "allow" }) },
      { key: "role_permissions_agent", value: JSON.stringify({ inbox_access: "allow" }) },
    ]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    expect(body.data.admin).toEqual({ contacts_access: "allow" });
    expect(body.data.agent).toEqual({ inbox_access: "allow" });
    expect(body.data.viewer).toEqual({});
  });
});

describe("PUT /roles/:role/permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-admin", async () => {
    const app = await buildApp({ role: "agent" as const });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for invalid role name", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "PUT",
      url: "/roles/hacker/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(400);
  });

  it("upserts permissions and returns them", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.upsert.mockResolvedValue({
      key: "role_permissions_agent",
      value: JSON.stringify({ inbox_access: "allow" }),
    } as unknown as { key: string; value: string });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { role: string; permissions: Record<string, string> } }>();
    expect(body.data.role).toBe("agent");
    expect(body.data.permissions).toEqual({ inbox_access: "allow" });

    expect(mockPrisma.vendorSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId_key: { organizationId: "org-1", key: "role_permissions_agent" } },
      create: { organizationId: "org-1", key: "role_permissions_agent", value: JSON.stringify({ inbox_access: "allow" }) },
      update: { value: JSON.stringify({ inbox_access: "allow" }) },
    });
  });

  it("allows superAdmin to update permissions", async () => {
    const app = await buildApp({ role: "superAdmin" as const });
    mockPrisma.vendorSetting.upsert.mockResolvedValue({} as unknown as { key: string; value: string });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/manager/permissions",
      payload: { permissions: { campaigns_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
  });
});
