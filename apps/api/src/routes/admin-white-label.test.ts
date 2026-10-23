import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/redis.js", () => ({ redis: { incr: vi.fn(), expire: vi.fn(), set: vi.fn(), del: vi.fn(), get: vi.fn() } }));
vi.mock("../lib/mail.js", () => ({ sendMail: vi.fn(), isEmailConfigured: vi.fn().mockReturnValue(true) }));

const mockPrisma = {
  organization: { findUnique: vi.fn(), updateMany: vi.fn() },
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
  brandRevision: 5,
};

describe("PATCH /v1/admin/organizations/:orgId/white-label", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ ...complete });
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(async () => {
    await app.close();
  });

  it("403 for a non-super-admin before touching the db", async () => {
    app = await buildApp("admin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 5 } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled();
  });

  it("enables with ONE conditional write that carries every precondition, and audits org.white_label", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 5 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { organizationId: "org-1", whiteLabelEnabled: true } });
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-1",
        isParent: true,
        parentOrganizationId: null,
        brandName: { not: null },
        brandColor: { not: null },
        slug: { not: null },
        brandSupportEmail: { not: null },
        brandRevision: 5,
      },
      data: { whiteLabelEnabled: true },
    });
    await vi.waitFor(() => expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1));
    const audit = mockPrisma.adminAuditLog.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(audit.data).toMatchObject({ action: "org.white_label", targetId: "org-1" });
  });

  it("409 NOT_PARENT when the conditional write matched nothing and the org is not a parent or is a child", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    for (const row of [{ ...complete, isParent: false }, { ...complete, parentOrganizationId: "p-1" }]) {
      mockPrisma.organization.findUnique.mockResolvedValue(row);
      const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 5 } });
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("NOT_PARENT");
    }
  });

  it("409 BRAND_INCOMPLETE listing the missing fields", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.organization.findUnique.mockResolvedValue({ ...complete, brandSupportEmail: null, slug: null });
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 5 } });
    expect(res.statusCode).toBe(409);
    const err = res.json<{ error: { code: string; missing: string[] } }>().error;
    expect(err.code).toBe("BRAND_INCOMPLETE");
    expect(err.missing).toEqual(["slug", "brandSupportEmail"]);
  });

  it("race: the brand loses its support email after the first look => still BRAND_INCOMPLETE, never enabled", async () => {
    app = await buildApp("superAdmin");
    // The conditional write sees the incomplete row (count 0); the re-read reports what is missing.
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.organization.findUnique.mockResolvedValue({ ...complete, brandSupportEmail: null });
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 5 } });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { missing: string[] } }>().error.missing).toEqual(["brandSupportEmail"]);
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledTimes(1);
  });

  it("disabling is always allowed, with no preconditions", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { organizationId: "org-1", whiteLabelEnabled: false } });
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({ where: { id: "org-1" }, data: { whiteLabelEnabled: false } });
  });

  it("404 for an unknown org and 400 for a bad body", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 5 } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: "yes" } })).statusCode).toBe(400);
  });

  it("enabling without reviewedRevision is 400 and writes nothing", async () => {
    app = await buildApp("superAdmin");
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { field: string } }>().error.field).toBe("reviewedRevision");
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled();
  });

  it("a stale reviewed revision is 409 BRAND_CHANGED and the flag is not set", async () => {
    app = await buildApp("superAdmin");
    // The conditional write (revision 4) matches nothing because the brand is at revision 5 now.
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    const res = await app.inject({ method: "PATCH", url: URL, payload: { enabled: true, reviewedRevision: 4 } });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string; message: string } }>().error).toMatchObject({
      code: "BRAND_CHANGED",
      message: "The brand changed since you reviewed it; reload and review again",
    });
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.organization.updateMany.mock.calls[0]![0]).toMatchObject({ where: { brandRevision: 4 } });
  });

  it("disabling needs no revision and rejects unknown body fields", async () => {
    app = await buildApp("superAdmin");
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: false } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: URL, payload: { enabled: false, reviewedRevision: -1 } })).statusCode).toBe(400);
  });
});

describe("GET /v1/admin/organizations/:id (white-label review data)", () => {
  let app: FastifyInstance;
  const orgRow = (o: Record<string, unknown> = {}) => ({
    id: "org-1",
    name: "Acme",
    isParent: true,
    whiteLabelEnabled: false,
    brandName: "Acme Cloud",
    brandColor: "#112233",
    brandSupportEmail: "help@acme.test",
    brandHidePoweredBy: true,
    brandRevision: 7,
    slug: "acme",
    logoImage: "https://pub.test-r2.dev/brand/org-1/a.png",
    smallLogoImage: null,
    favicon: null,
    darkLogoImage: null,
    darkSmallLogoImage: null,
    darkFavicon: null,
    _count: { users: 2, conversations: 3 },
    ...o,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockPrisma, {
      contact: { count: vi.fn().mockResolvedValue(0) },
      message: { count: vi.fn().mockResolvedValue(0) },
      campaign: { count: vi.fn().mockResolvedValue(0) },
    });
  });
  afterEach(async () => {
    await app.close();
  });

  it("returns the review data, with the revision, for a parent", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue(orgRow());
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations/org-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { brandReview: unknown } }>().data.brandReview).toEqual({
      brandName: "Acme Cloud",
      brandColor: "#112233",
      brandSupportEmail: "help@acme.test",
      slug: "acme",
      hidePoweredBy: true,
      logoUrl: "https://pub.test-r2.dev/brand/org-1/a.png",
      smallLogoUrl: null,
      faviconUrl: null,
      darkLogoUrl: null,
      darkSmallLogoUrl: null,
      darkFaviconUrl: null,
      brandRevision: 7,
      whiteLabelEnabled: false,
    });
  });

  it("adds nothing for a non-parent and nothing for a non-super-admin", async () => {
    app = await buildApp("superAdmin");
    mockPrisma.organization.findUnique.mockResolvedValue(orgRow({ isParent: false }));
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations/org-1" });
    expect(res.json<{ data: Record<string, unknown> }>().data).not.toHaveProperty("brandReview");
    await app.close();
    app = await buildApp("admin");
    const denied = await app.inject({ method: "GET", url: "/v1/admin/organizations/org-1" });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain("Acme Cloud");
  });
});
