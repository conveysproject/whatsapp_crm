import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { registerRouter } from "./register.js";

const { mockVerifyClerkToken } = vi.hoisted(() => ({
  mockVerifyClerkToken: vi.fn(),
}));
vi.mock("../lib/clerk.js", () => ({ verifyClerkToken: mockVerifyClerkToken }));

const mockPrisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  organization: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  vendorSetting: { createMany: vi.fn() },
  leadStatus: { count: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  await app.register(registerRouter);
  return app;
}

describe("POST /register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyClerkToken.mockResolvedValue({ userId: "user-new" });
    mockPrisma.organization.create.mockResolvedValue({ id: "org-new" });
    mockPrisma.user.create.mockResolvedValue({});
    mockPrisma.vendorSetting.createMany.mockResolvedValue({ count: 4 });
    mockPrisma.leadStatus.count.mockResolvedValue(0);
    mockPrisma.leadStatus.createMany.mockResolvedValue({ count: 7 });
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "ls-won" }, { id: "ls-lost" }]);
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
  });

  it("seeds default role permissions for new org", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // new user
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { authorization: "Bearer test-token" },
      payload: { companyName: "ACME", industry: "Tech", revenue: "1M" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vendorSetting.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_admin" }),
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_manager" }),
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_agent" }),
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_viewer" }),
      ]),
      skipDuplicates: true,
    });
    expect(mockPrisma.vendorSetting.createMany).toHaveBeenCalledTimes(1);
  });

  it("does not seed role permissions on existing-org update", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ organizationId: "org-existing", role: "admin" });
    mockPrisma.organization.update.mockResolvedValue({});
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { authorization: "Bearer test-token" },
      payload: { companyName: "ACME Updated", industry: "Tech", revenue: "2M" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vendorSetting.createMany).not.toHaveBeenCalled();
  });
});
