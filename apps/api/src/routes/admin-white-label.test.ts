import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/redis.js", () => ({ redis: { incr: vi.fn(), expire: vi.fn(), set: vi.fn(), del: vi.fn(), get: vi.fn() } }));
vi.mock("../lib/mail.js", () => ({ sendMail: vi.fn(), isEmailConfigured: vi.fn().mockReturnValue(true) }));

const mockPrisma = {
  organization: { findUnique: vi.fn(), update: vi.fn() },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
};

async function buildApp(role: "superAdmin" | "admin"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "platform", role, permissions: {}, teamId: null, teamRole: null };
  });
  const { adminRouter } = await import("./admin.js");
  await app.register(adminRouter, { prefix: "/v1" });
  return app;
}

const URL = "/v1/admin/organizations/org-1/white-label";
const complete = {
  id: "org-1",
  isParent: true,
  parentOrganizationId: null,
  brandName: "Acme",
  brandColor: "#112233",
  slug: "acme",
  brandSupportEmail: "help@acme.test",
};

describe("PATCH /v1/admin/organizations/:orgId/white-label", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ ...complete });
    mockPrisma.organization.update.mockImplementation(async (a: { data: { whiteLabelEnabled: boolean } }) => ({
      id: "org-1",
      whiteLabelEnabled: a.data.whiteLabelEnabled,
    }));
  });
  afterEach(async () => {
    await app.close();
  });

  it("403 for a non-super-admin before touching the db", async () => {
    app = await buildApp("admin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("enables a complete parent brand and audits org.white_label", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { organizationId: "org-1", whiteLabelEnabled: true } });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-1" }, data: { whiteLabelEnabled: true } }),
    );
    await vi.waitFor(() => expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1));
    const audit = mockPrisma.adminAuditLog.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(audit.data).toMatchObject({ action: "org.white_label", targetId: "org-1" });
  });

  it("409 NOT_PARENT when the org is not a parent or is a child", async () => {
    app = await buildApp("superAdmin");
    for (const row of [{ ...complete, isParent: false }, { ...complete, parentOrganizationId: "p-1" }]) {
      mockPrisma.organization.findUnique.mockResolvedValue(row);
      const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("NOT_PARENT");
    }
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("409 BRAND_INCOMPLETE listing the missing fields", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue({ ...complete, brandSupportEmail: null, slug: null });
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(409);
    const err = res.json<{ error: { code: string; missing: string[] } }>().error;
    expect(err.code).toBe("BRAND_INCOMPLETE");
    expect(err.missing).toEqual(["slug", "brandSupportEmail"]);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("disabling is always allowed, even for an incomplete or non-parent org", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue({ ...complete, isParent: false, brandName: null });
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { organizationId: "org-1", whiteLabelEnabled: false } });
  });

  it("404 for an unknown org and 400 for a bad body", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: "yes" } })).statusCode).toBe(400);
  });
});
