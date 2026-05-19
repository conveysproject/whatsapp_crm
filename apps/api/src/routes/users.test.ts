import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  user: { findMany: vi.fn(), update: vi.fn() },
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
