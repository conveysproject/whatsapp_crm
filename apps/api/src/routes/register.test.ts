import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as IdentityModule from "../auth/identity.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { registerRouter } from "./register.js";

const { mockVerifyClerkToken, mockVerifyBearer } = vi.hoisted(() => ({
  mockVerifyClerkToken: vi.fn(),
  mockVerifyBearer: vi.fn(),
}));
vi.mock("../auth/identity.js", async (orig) => ({
  ...(await orig<typeof IdentityModule>()),
  verifyBearer: mockVerifyBearer,
}));
vi.mock("../lib/clerk.js", () => ({ verifyClerkToken: mockVerifyClerkToken }));

const mockPrisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  authAccount: { findUnique: vi.fn() },
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
    mockVerifyBearer.mockImplementation(async () => ({ userId: "user-new", sid: null, typ: "user" }));
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

  describe("wbmsg mode", () => {
    const verifiedAccount = {
      email: "a@x.com", firstName: "Ann", lastName: "Lee", emailVerifiedAt: new Date(),
    };
    beforeEach(() => {
      process.env.AUTH_PROVIDER = "wbmsg";
      mockVerifyBearer.mockResolvedValue({ userId: "usr_a", sid: "s1", typ: "user" });
      mockPrisma.authAccount.findUnique.mockResolvedValue(verifiedAccount);
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });
    afterEach(() => { delete process.env.AUTH_PROVIDER; });

    it("takes email and names from auth_accounts, ignoring the body", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST", url: "/register",
        headers: { authorization: "Bearer t" },
        payload: { companyName: "ACME", industry: "Tech", revenue: "1M", email: "evil@x.com", firstName: "Eve" },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.authAccount.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "usr_a" } }));
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: "usr_a", email: "a@x.com", fullName: "Ann Lee" }),
      });
    });

    it("falls back to the email when the account has no names", async () => {
      mockPrisma.authAccount.findUnique.mockResolvedValue({ ...verifiedAccount, firstName: null, lastName: null });
      const app = await buildApp();
      await app.inject({
        method: "POST", url: "/register",
        headers: { authorization: "Bearer t" },
        payload: { companyName: "ACME", industry: "Tech", revenue: "1M" },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: "a@x.com", fullName: "a@x.com" }),
      });
    });

    it.each([
      ["missing", null],
      ["unverified", { ...verifiedAccount, emailVerifiedAt: null }],
    ])("rejects a %s account with EMAIL_NOT_VERIFIED", async (_n, account) => {
      mockPrisma.authAccount.findUnique.mockResolvedValue(account);
      const app = await buildApp();
      const res = await app.inject({
        method: "POST", url: "/register",
        headers: { authorization: "Bearer t" },
        payload: { companyName: "ACME", industry: "Tech", revenue: "1M" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("EMAIL_NOT_VERIFIED");
      expect(mockPrisma.organization.create).not.toHaveBeenCalled();
    });
  });

  it("clerk mode still uses the body email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    await app.inject({
      method: "POST", url: "/register",
      headers: { authorization: "Bearer t" },
      payload: { companyName: "ACME", industry: "Tech", revenue: "1M", email: "body@x.com", firstName: "Bo" },
    });
    expect(mockPrisma.authAccount.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "body@x.com", fullName: "Bo" }),
    });
  });
});
