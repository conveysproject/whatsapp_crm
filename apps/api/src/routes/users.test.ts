import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const { mockRedisDel } = vi.hoisted(() => ({ mockRedisDel: vi.fn().mockResolvedValue(1) }));
vi.mock("../lib/redis.js", () => ({ redis: { del: mockRedisDel } }));

const mockPrisma = {
  user: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  organizationMember: {
    findFirst: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { userRoutes } = await import("./users.js");
  await app.register(userRoutes, { prefix: "/v1" });
  return app;
}

describe("PUT /v1/users/:id/permissions", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("upserts permissions on OrganizationMember record (D5)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u-2", role: "agent" });
    mockPrisma.organizationMember.upsert.mockResolvedValue({ id: "om-1", organizationId: "org-1", userId: "u-2", permissions: { manage_contacts: "allow" } });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/users/u-2/permissions",
      payload: { permissions: { manage_contacts: "allow", messaging: "deny" } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organizationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: "org-1", userId: "u-2" } },
        create: expect.objectContaining({ permissions: { manage_contacts: "allow", messaging: "deny" } }),
        update: { permissions: { manage_contacts: "allow", messaging: "deny" } },
      })
    );
  });

  it("returns 404 when target user not in org", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/users/u-999/permissions",
      payload: { permissions: {} },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /v1/users/me", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns current user id, fullName, email and role", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      fullName: "Rahul Sharma",
      email: "rahul@test.com",
      role: "admin",
      availability: "online",
    });
    const res = await app.inject({ method: "GET", url: "/v1/users/me" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { id: string; fullName: string; email: string; role: string } };
    expect(body.data.id).toBe("user-1");
    expect(body.data.fullName).toBe("Rahul Sharma");
    expect(body.data.email).toBe("rahul@test.com");
    expect(body.data.role).toBe("admin");
  });

  it("returns 404 when user is not found", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/users/me" });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /v1/users/me/availability", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates availability to away", async () => {
    mockPrisma.user.update.mockResolvedValue({ id: "user-1", availability: "away" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/availability",
      payload: { availability: "away" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { availability: "away" },
      select: { id: true, availability: true },
    });
  });

  it("rejects invalid availability values", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/availability",
      payload: { availability: "busy" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("settings_agents sub gate", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "manager"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions };
    });
    const { userRoutes } = await import("./users.js");
    await app.register(userRoutes, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("blocks PATCH /users/:id/role when settings_agents sub is off", async () => {
    const app = await buildAppAs({ settings_access: "allow" }); // settings_agents sub off
    const res = await app.inject({ method: "PATCH", url: "/v1/users/u-2/role", payload: { role: "agent" } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows PATCH when settings_agents sub is on", async () => {
    mockPrisma.user.update.mockResolvedValue({ id: "u-2", email: "a@b.com", role: "agent" });
    const app = await buildAppAs({ settings_access: "allow", "settings_access@settings_agents": "allow" });
    const res = await app.inject({ method: "PATCH", url: "/v1/users/u-2/role", payload: { role: "agent" } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses settings_agents sub gate", async () => {
    mockPrisma.user.update.mockResolvedValue({ id: "u-2", email: "a@b.com", role: "agent" });
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "PATCH", url: "/v1/users/u-2/role", payload: { role: "agent" } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
