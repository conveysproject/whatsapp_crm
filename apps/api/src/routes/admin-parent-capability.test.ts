import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/redis.js", () => ({ redis: { incr: vi.fn(), expire: vi.fn(), set: vi.fn(), del: vi.fn(), get: vi.fn() } }));
vi.mock("../lib/mail.js", () => ({ sendMail: vi.fn(), isEmailConfigured: vi.fn().mockReturnValue(true) }));

const mockPrisma = {
  organization: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
};

type Role = "superAdmin" | "admin";

async function buildApp(role: Role): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null };
  });
  const { adminRouter } = await import("./admin.js");
  await app.register(adminRouter, { prefix: "/v1" });
  return app;
}

const URL = "/v1/admin/organizations/org-1/parent-capability";

describe("PATCH /v1/admin/organizations/:orgId/parent-capability", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env["PARENT_ORGS_ENABLED"] = "true";
    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", parentOrganizationId: null, isParent: false });
    mockPrisma.organization.findMany.mockResolvedValue([]);
    mockPrisma.organization.update.mockImplementation(async (a: { data: { isParent: boolean } }) => ({ id: "org-1", isParent: a.data.isParent }));
  });
  afterEach(async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    await app.close();
  });

  it("super admin enabling returns 200 and sets isParent", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { organizationId: "org-1", isParent: true } });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-1" }, data: { isParent: true } })
    );
    await vi.waitFor(() => expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1));
    const audit = mockPrisma.adminAuditLog.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(audit.data).toMatchObject({ action: "org.parent_capability", targetId: "org-1" });
  });

  it("returns 403 for a non-super-admin", async () => {
    app = await buildApp("admin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("returns 409 HAS_CHILDREN when disabling a parent that still has children", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findMany.mockResolvedValue([{ id: "child-1" }]);
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: false } });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("HAS_CHILDREN");
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("disables a parent with no children", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { organizationId: "org-1", isParent: false } });
  });

  it("returns 404 when the feature flag is off", async () => {
    app = await buildApp("superAdmin");
    delete process.env["PARENT_ORGS_ENABLED"];
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("returns 409 IS_CHILD when enabling an org that is itself a child", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", parentOrganizationId: "p-1", isParent: false });
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("IS_CHILD");
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown org", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("rejects a body without a boolean enabled", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: "yes" } });
    expect(res.statusCode).toBe(400);
  });
});
