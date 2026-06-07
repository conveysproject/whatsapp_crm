import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  user: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  organizationMember: {
    findFirst: vi.fn(),
    update: vi.fn(),
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

  it("updates permissions on OrganizationMember record", async () => {
    mockPrisma.organizationMember.findFirst.mockResolvedValue({ id: "om-1", organizationId: "org-1", userId: "u-2" });
    mockPrisma.organizationMember.update.mockResolvedValue({ id: "om-1", permissions: { manage_contacts: "allow" } });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/users/u-2/permissions",
      payload: { permissions: { manage_contacts: "allow", messaging: "deny" } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organizationMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { permissions: { manage_contacts: "allow", messaging: "deny" } } })
    );
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
