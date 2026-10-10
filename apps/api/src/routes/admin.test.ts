import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as ActivationModule from "../lib/billing/activation.js";

const mockRedis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  pttl: vi.fn(),
}));
vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
const { activatePlanMock } = vi.hoisted(() => ({ activatePlanMock: vi.fn() }));
vi.mock("../lib/billing/activation.js", async (orig) => ({
  ...(await orig<typeof ActivationModule>()),
  activatePlan: activatePlanMock,
}));
const mockMail = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue(undefined), isEmailConfigured: vi.fn().mockReturnValue(true) }));
vi.mock("../lib/mail.js", () => mockMail);

const mockPrisma = {
  user: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  impersonationLog: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  organization: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
  },
  manualSubscription: {
    create: vi.fn(),
  },
  platformConfig: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  adminAuditLog: {
    create: vi.fn().mockResolvedValue({}),
  },
};

// SuperAdmin auth
const mockAdminAuth = { userId: "sa-1", organizationId: "platform", role: "superAdmin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAdminAuth; });
  const { adminRouter } = await import("./admin.js");
  await app.register(adminRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/admin/organizations", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns all organizations", async () => {
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: "org-1", name: "Acme Corp", status: "active", _count: { users: 3 } },
      { id: "org-2", name: "Beta Ltd", status: "active", _count: { users: 0 } },
    ]);
    mockPrisma.organization.count.mockResolvedValue(2);
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations" });
    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { _count: { members: number } }[] }>().data;
    expect(data).toHaveLength(2);
    expect(data.map((o) => o._count.members)).toEqual([3, 0]);
  });
});

describe("GET /v1/admin/organizations/:id/users", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("lists org-scoped, non-deleted, non-superAdmin users with safe fields only", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u-1", email: "a@x.com", fullName: "A", role: "agent", isActive: true, lastSignInAt: null },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations/org-1/users" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    const arg = mockPrisma.user.findMany.mock.calls[0]![0] as { where: Record<string, unknown>; select: Record<string, boolean> };
    expect(arg.where).toMatchObject({ organizationId: "org-1", deletedAt: null, role: { not: "superAdmin" } });
    expect(Object.keys(arg.select).sort()).toEqual(["email", "fullName", "id", "isActive", "lastSignInAt", "role"]);
  });

  it("returns 404 when the org does not exist", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations/nope/users" });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /v1/admin/organizations/:id/ban", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets org status to banned with reason", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", name: "Acme Corp", status: "active" });
    mockPrisma.organization.update.mockResolvedValue({ id: "org-1", status: "banned", banReason: "TOS violation" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/organizations/org-1/ban",
      payload: { reason: "TOS violation" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "banned", banReason: "TOS violation" } })
    );
  });
});

describe("POST /v1/admin/organizations/:id/unban", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("clears org ban status", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", name: "Acme Corp", status: "banned" });
    mockPrisma.organization.update.mockResolvedValue({ id: "org-1", status: "active", banReason: null });
    const res = await app.inject({ method: "POST", url: "/v1/admin/organizations/org-1/unban" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active", banReason: null } })
    );
  });
});

describe("SuperAdmin guard", () => {
  let appAsAdmin: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    appAsAdmin = Fastify({ logger: false });
    appAsAdmin.decorate("prisma", mockPrisma as unknown as PrismaClient);
    appAsAdmin.addHook("onRequest", async (req) => {
      req.auth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null, teamRole: null };
    });
    const { adminRouter } = await import("./admin.js");
    await appAsAdmin.register(adminRouter, { prefix: "/v1" });
  });
  afterEach(async () => { await appAsAdmin.close(); });

  it("returns 403 for non-superAdmin", async () => {
    const res = await appAsAdmin.inject({ method: "GET", url: "/v1/admin/organizations" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for non-superAdmin on org users list", async () => {
    const res = await appAsAdmin.inject({ method: "GET", url: "/v1/admin/organizations/org-1/users" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /v1/admin/platform-config", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns all platform config keys", async () => {
    mockPrisma.platformConfig.findMany.mockResolvedValue([
      { id: "pc-1", key: "smtp_host", value: "smtp.resend.com", dataType: "string" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/admin/platform-config" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/admin/organizations/:orgId/users/:userId/impersonate", () => {
  let app: FastifyInstance;
  const url = "/v1/admin/organizations/org-1/users/user-1/impersonate";
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue("OK");
    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", name: "Acme Corp" });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-1", role: "agent", fullName: "Ann" });
    mockPrisma.impersonationLog.create.mockResolvedValue({});
    mockAdminAuth.role = "superAdmin";
    app = await buildApp();
  });
  afterEach(async () => { mockAdminAuth.role = "superAdmin"; await app.close(); });

  it("403 for non-superAdmin", async () => {
    (mockAdminAuth as { role: string }).role = "admin";
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("404 when the org does not exist", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(404);
  });

  it("404 when the user is not in that org, inactive or deleted (query is scoped)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", organizationId: "org-1", isActive: true, deletedAt: null },
      })
    );
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("403 when the target is a superAdmin", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-1", role: "superAdmin", fullName: "Root" });
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("429 over the per-hour limit", async () => {
    mockRedis.incr.mockResolvedValue(11);
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(429);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("200 stores a read-only user-scoped token, logs and audits", async () => {
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(200);
    const { token, expiresIn, mode } = res.json<{ data: { token: string; expiresIn: number; mode: string } }>().data;
    expect(expiresIn).toBe(900);
    expect(mode).toBe("readonly");
    expect(mockRedis.set).toHaveBeenCalledWith(
      `impersonate:${token}`,
      JSON.stringify({ organizationId: "org-1", targetUserId: "user-1", issuedBy: "sa-1", mode: "readonly" }),
      "EX",
      900
    );
    expect(mockPrisma.impersonationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "sa-1",
        organizationId: "org-1",
        targetUserId: "user-1",
        mode: "readonly",
        token,
      }),
    });
    await new Promise((r) => setImmediate(r));
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: "sa-1", action: "user.impersonate", targetType: "user", targetId: "user-1" }),
    });
  });

  it("creates the log row BEFORE the Redis token; a log failure creates no token", async () => {
    mockPrisma.impersonationLog.create.mockRejectedValue(new Error("db down"));
    const res = await app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(500);
    expect(mockRedis.set).not.toHaveBeenCalled();
    mockPrisma.impersonationLog.create.mockResolvedValue({});
    await app.inject({ method: "POST", url });
    expect(mockPrisma.impersonationLog.create.mock.invocationCallOrder[1]!)
      .toBeLessThan(mockRedis.set.mock.invocationCallOrder[0]!);
  });

  it("old org-level issue route is gone", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/organizations/org-1/impersonate" });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/admin/organizations/:id/impersonate (revoke)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });
  const call = () => app.inject({
    method: "DELETE",
    url: "/v1/admin/organizations/org-1/impersonate",
    payload: { token: "tok" },
  });

  it("revokes the issuer's own token and closes the log", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ organizationId: "org-1", targetUserId: "u1", issuedBy: "sa-1", mode: "readonly" }));
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.impersonationLog.updateMany.mockResolvedValue({ count: 1 });
    const res = await call();
    expect(res.statusCode).toBe(204);
    expect(mockRedis.del).toHaveBeenCalledWith("impersonate:tok");
    expect(mockPrisma.impersonationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: "tok", actorId: "sa-1", endedAt: null } })
    );
  });

  it("403 when a different super admin tries to revoke; token is kept", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ organizationId: "org-1", targetUserId: "u1", issuedBy: "sa-other", mode: "readonly" }));
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(mockPrisma.impersonationLog.updateMany).not.toHaveBeenCalled();
  });

  it("403 when the :id org does not match the token's organization", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ organizationId: "org-OTHER", targetUserId: "u1", issuedBy: "sa-1", mode: "readonly" }));
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("is idempotent for an already expired token (only closes the caller's own log rows)", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.impersonationLog.updateMany.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.impersonationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: "tok", actorId: "sa-1", endedAt: null } })
    );
  });
});

describe("POST /v1/admin/impersonation/elevate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });
  const url = "/v1/admin/impersonation/elevate";
  const reason = "Customer reported a stuck conversation, replying on their behalf";
  const payloadOf = (over: object = {}) => JSON.stringify({ organizationId: "org-1", targetUserId: "user-1", issuedBy: "sa-1", mode: "readonly", ...over });
  const post = (body: object) => app.inject({ method: "POST", url, payload: body });

  function happy() {
    mockRedis.get.mockResolvedValue(payloadOf());
    mockRedis.pttl.mockResolvedValue(600000);
    mockRedis.set.mockResolvedValue("OK");
    mockPrisma.impersonationLog.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findMany.mockResolvedValue([{ email: "other@wbmsg.test" }]);
  }

  it("elevates to edit mode keeping the remaining TTL, logs reason, audits, notifies other super admins", async () => {
    happy();
    const res = await post({ token: "tok", reason });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { mode: "edit", expiresIn: 600 } });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "impersonate:tok",
      JSON.stringify({ organizationId: "org-1", targetUserId: "user-1", issuedBy: "sa-1", mode: "edit" }),
      "PX", 600000
    );
    expect(mockPrisma.impersonationLog.updateMany).toHaveBeenCalledWith({
      where: { token: "tok", actorId: "sa-1", endedAt: null },
      data: { mode: "edit", elevationReason: reason },
    });
    await new Promise((r) => setImmediate(r));
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: "sa-1", action: "user.impersonate.elevate", targetType: "user", targetId: "user-1" }),
    });
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: "superAdmin", id: { not: "sa-1" }, isActive: true, deletedAt: null }),
    }));
    expect(mockMail.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["other@wbmsg.test"] }));
  });

  it("updates the log BEFORE the Redis set (log failure leaves the session read-only)", async () => {
    happy();
    mockPrisma.impersonationLog.updateMany.mockRejectedValue(new Error("db down"));
    const res = await post({ token: "tok", reason });
    expect(res.statusCode).toBe(500);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("404 and no Redis set when no open log row matched (count 0)", async () => {
    happy();
    mockPrisma.impersonationLog.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ token: "tok", reason });
    expect(res.statusCode).toBe(404);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("logs a warning when the elevation email is skipped because email is not configured", async () => {
    happy();
    mockMail.isEmailConfigured.mockReturnValueOnce(false);
    const warn = vi.spyOn(app.log, "warn");
    const res = await post({ token: "tok", reason });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("email is not configured"));
    expect(mockMail.sendMail).not.toHaveBeenCalled();
  });

  it("validates reason length (10-500) and presence of token", async () => {
    expect((await post({ token: "tok", reason: "short" })).statusCode).toBe(400);
    expect((await post({ token: "tok", reason: "x".repeat(501) })).statusCode).toBe(400);
    expect((await post({ reason })).statusCode).toBe(400);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("403 for a token issued by a different admin", async () => {
    happy();
    mockRedis.get.mockResolvedValue(payloadOf({ issuedBy: "sa-other" }));
    const res = await post({ token: "tok", reason });
    expect(res.statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("404 for unknown/expired token and for demo-style payloads", async () => {
    happy();
    mockRedis.get.mockResolvedValue(null);
    expect((await post({ token: "tok", reason })).statusCode).toBe(404);
    mockRedis.get.mockResolvedValue(JSON.stringify({ organizationId: "org-1", isDemo: true }));
    expect((await post({ token: "tok", reason })).statusCode).toBe(404);
    mockRedis.get.mockResolvedValue(payloadOf());
    mockRedis.pttl.mockResolvedValue(-2);
    expect((await post({ token: "tok", reason })).statusCode).toBe(404);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("409 when already elevated", async () => {
    happy();
    mockRedis.get.mockResolvedValue(payloadOf({ mode: "edit" }));
    expect((await post({ token: "tok", reason })).statusCode).toBe(409);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("403 for non super admins and for impersonated sessions", async () => {
    happy();
    const orig = { ...mockAdminAuth };
    Object.assign(mockAdminAuth, { role: "admin" });
    expect((await post({ token: "tok", reason })).statusCode).toBe(403);
    Object.assign(mockAdminAuth, orig, { impersonation: { adminId: "sa-1", mode: "edit" } });
    expect((await post({ token: "tok", reason })).statusCode).toBe(403);
    delete (mockAdminAuth as Record<string, unknown>).impersonation;
    Object.assign(mockAdminAuth, orig);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("still succeeds when the notification email fails", async () => {
    happy();
    mockMail.sendMail.mockRejectedValueOnce(new Error("smtp down"));
    expect((await post({ token: "tok", reason })).statusCode).toBe(200);
  });
});

describe("POST /v1/admin/manual-subscriptions", () => {
  let app: FastifyInstance;
  const payload = { organizationId: "org-1", planTier: "growth", charges: 2999, chargesFrequency: "monthly", gateway: "bank_transfer" };
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    activatePlanMock.mockReset().mockResolvedValue({ duplicate: false });
    mockPrisma.manualSubscription.create.mockReset().mockResolvedValue({ id: "ms-7", ...payload, status: "active" });
    mockAdminAuth.role = "superAdmin";
    app = await buildApp();
  });
  afterEach(async () => { mockAdminAuth.role = "superAdmin"; await app.close(); });

  it("creates the subscription and activates the plan through activatePlan", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/manual-subscriptions", payload });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.manualSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: "org-1", planTier: "growth", status: "pending" }),
    });
    expect(activatePlanMock).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1", planTier: "growth", source: "admin", gateway: "bank_transfer",
      referenceId: "admin:ms-7", manualSubscriptionId: "ms-7", amountMinor: 299900,
    });
  });
  it("403 for non-superAdmin and activates nothing", async () => {
    (mockAdminAuth as { role: string }).role = "admin";
    const res = await app.inject({ method: "POST", url: "/v1/admin/manual-subscriptions", payload });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.manualSubscription.create).not.toHaveBeenCalled();
    expect(activatePlanMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /v1/admin/organizations/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockReset().mockResolvedValue({ id: "org-1" });
    mockPrisma.organization.update.mockReset().mockResolvedValue({ id: "org-1" });
    mockAdminAuth.role = "superAdmin";
    app = await buildApp();
  });
  afterEach(async () => { mockAdminAuth.role = "superAdmin"; await app.close(); });

  it("a plan change also resets billingStatus and grace", async () => {
    const res = await app.inject({ method: "PATCH", url: "/v1/admin/organizations/org-1", payload: { planTier: "scale" } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { planTier: "scale", billingStatus: "active", billingGraceEndsAt: null },
    });
  });

  it("a status-only change leaves billing state alone", async () => {
    await app.inject({ method: "PATCH", url: "/v1/admin/organizations/org-1", payload: { status: "inactive" } });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({ where: { id: "org-1" }, data: { status: "inactive" } });
  });
});
