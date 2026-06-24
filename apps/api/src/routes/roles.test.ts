import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { rolesRouter } from "./roles.js";

const mockPrisma = {
  vendorSetting: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const { mockRedisDel } = vi.hoisted(() => ({ mockRedisDel: vi.fn() }));
const mockRedis = { del: mockRedisDel };
vi.mock("../lib/redis.js", () => ({ redis: { del: mockRedisDel } }));

const mockAuth = {
  userId: "u-1",
  organizationId: "org-1",
  role: "admin" as "superAdmin" | "admin" | "manager" | "agent" | "viewer",
  permissions: {},
};

async function buildApp(authOverride?: Partial<typeof mockAuth>) {
  const app = Fastify({ logger: false });
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    (request as unknown as { auth: typeof mockAuth }).auth = { ...mockAuth, ...authOverride };
  });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  await app.register(rolesRouter);
  return app;
}

describe("GET /roles/permissions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 403 for non-admin", async () => {
    const app = await buildApp({ role: "agent" as const satisfies typeof mockAuth.role });
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(403);
  });

  it("returns built-in defaults for editable roles only — admin actor (D4 + hierarchy)", async () => {
    const app = await buildApp(); // admin actor → editable: manager/agent/viewer
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    // editable roles return their built-in defaults
    expect(body.data.manager).toMatchObject({ contacts_access: "allow", inbox_access: "allow" });
    expect(body.data.agent).toMatchObject({ contacts_access: "allow", inbox_access: "allow" });
    expect(body.data.viewer).toMatchObject({ contacts_access: "allow" });
    // admin cannot edit admin (self) or superAdmin → not returned
    expect(body.data.admin).toBeUndefined();
    expect(body.data.superAdmin).toBeUndefined();
  });

  it("returns the admin role for a superAdmin actor, but not superAdmin (no self)", async () => {
    const app = await buildApp({ role: "superAdmin" as const satisfies typeof mockAuth.role });
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    expect(body.data.admin).toMatchObject({ contacts_access: "allow", inbox_access: "allow" });
    expect(body.data.viewer).toMatchObject({ contacts_access: "allow" });
    expect(body.data.superAdmin).toBeUndefined();
  });

  it("returns stored permissions for editable roles", async () => {
    const app = await buildApp(); // admin actor
    mockPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "role_permissions_agent", value: JSON.stringify({ inbox_access: "allow" }) },
    ]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    // row present → stored value used exactly (even if minimal)
    expect(body.data.agent).toEqual({ inbox_access: "allow" });
    // manager has no stored row → built-in defaults returned
    expect(body.data.manager).toMatchObject({ contacts_access: "allow" });
    // admin not editable by an admin actor → not returned
    expect(body.data.admin).toBeUndefined();
  });
});

describe("PUT /roles/:role/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
  });

  it("returns 403 for non-admin", async () => {
    const app = await buildApp({ role: "agent" as const satisfies typeof mockAuth.role });

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
    const app = await buildApp({ role: "superAdmin" as const satisfies typeof mockAuth.role });
    mockPrisma.vendorSetting.upsert.mockResolvedValue({} as unknown as { key: string; value: string });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/manager/permissions",
      payload: { permissions: { campaigns_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
  });

  it("forbids an admin from modifying the admin role (no self-modify)", async () => {
    const app = await buildApp(); // admin actor
    const res = await app.inject({
      method: "PUT",
      url: "/roles/admin/permissions",
      payload: { permissions: { contacts_access: "allow" } },
    });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
  });

  it("forbids an admin from modifying the superAdmin role", async () => {
    const app = await buildApp(); // admin actor
    const res = await app.inject({
      method: "PUT",
      url: "/roles/superAdmin/permissions",
      payload: { permissions: { contacts_access: "allow" } },
    });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
  });

  it("forbids superAdmin from modifying the superAdmin role (no self-modify)", async () => {
    const app = await buildApp({ role: "superAdmin" as const satisfies typeof mockAuth.role });
    const res = await app.inject({
      method: "PUT",
      url: "/roles/superAdmin/permissions",
      payload: { permissions: { contacts_access: "allow" } },
    });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.vendorSetting.upsert).not.toHaveBeenCalled();
  });

  it("allows superAdmin to modify the admin role", async () => {
    const app = await buildApp({ role: "superAdmin" as const satisfies typeof mockAuth.role });
    mockPrisma.vendorSetting.upsert.mockResolvedValue({} as unknown as { key: string; value: string });
    const res = await app.inject({
      method: "PUT",
      url: "/roles/admin/permissions",
      payload: { permissions: { contacts_access: "allow" } },
    });
    expect(res.statusCode).toBe(200);
  });

  it("invalidates auth caches for users with the affected role", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u-10" }, { id: "u-11" }]);

    const res = await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", role: "agent" },
      select: { id: true },
    });
    expect(mockRedis.del).toHaveBeenCalledWith("auth:user:u-10", "auth:user:u-11");
  });

  it("skips redis.del when no users have the role", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);

    await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});
