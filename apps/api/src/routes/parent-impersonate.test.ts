import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type * as ParentOrgsModule from "../lib/parent-orgs.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const calls = vi.hoisted(() => ({ order: [] as string[] }));
const mockCanBeParent = vi.hoisted(() => vi.fn());
const mockIsChildOf = vi.hoisted(() => vi.fn());
vi.mock("../lib/parent-orgs.js", async (orig) => ({
  ...(await orig<typeof ParentOrgsModule>()),
  canBeParent: (...a: unknown[]) => mockCanBeParent(...a),
  isChildOf: (...a: unknown[]) => mockIsChildOf(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: Record<string, any> = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  impersonationLog: { create: vi.fn(), updateMany: vi.fn() },
  parentAuditEvent: { create: vi.fn() },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const mockRedis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  pttl: vi.fn(),
}));
vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));

type TestAuth = {
  userId: string;
  organizationId: string;
  role: "admin" | "manager" | "superAdmin";
  permissions: Record<string, string>;
  teamId: null;
  teamRole: null;
  sid: string | null;
  impersonation?: { adminId: string; mode: "readonly" | "edit"; parentOrganizationId?: string };
};
const baseAuth: TestAuth = {
  userId: "pu-1",
  organizationId: "p1",
  role: "admin",
  permissions: {},
  teamId: null,
  teamRole: null,
  sid: "sid-1",
};
let auth: TestAuth = baseAuth;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = auth;
  });
  const { parentRoutes } = await import("./parent.js");
  await app.register(parentRoutes, { prefix: "/v1" });
  return app;
}

let app: FastifyInstance;
const impersonate = (childId: string, body: unknown = {}) =>
  app.inject({ method: "POST", url: `/v1/parent/children/${childId}/impersonate`, payload: body as object });

beforeEach(async () => {
  vi.clearAllMocks();
  calls.order = [];
  process.env["PARENT_ORGS_ENABLED"] = "true";
  auth = baseAuth;
  mockCanBeParent.mockResolvedValue(true);
  mockIsChildOf.mockImplementation(async (_p: unknown, parent: string, child: string) => parent === "p1" && child === "c1");
  mockPrisma.organization.findUnique.mockResolvedValue({ id: "c1", name: "Child One" });
  mockPrisma.user.findFirst.mockResolvedValue({ id: "cu-1", role: "admin" });
  mockPrisma.impersonationLog.create.mockImplementation(async () => {
    calls.order.push("log");
    return {};
  });
  mockPrisma.impersonationLog.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.parentAuditEvent.create.mockImplementation(async () => {
    calls.order.push("audit");
    return {};
  });
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.set.mockImplementation(async () => {
    calls.order.push("redis");
    return "OK";
  });
  mockRedis.pttl.mockResolvedValue(600_000);
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  delete process.env["PARENT_ORGS_ENABLED"];
});

describe("POST /v1/parent/children/:childId/impersonate", () => {
  it("404 when the feature flag is off", async () => {
    process.env["PARENT_ORGS_ENABLED"] = "false";
    expect((await impersonate("c1")).statusCode).toBe(404);
  });

  it("403 for a parent user without parent_access", async () => {
    auth = { ...baseAuth, role: "manager" };
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.impersonationLog.create).not.toHaveBeenCalled();
  });

  it("403 when the org is not a parent", async () => {
    mockCanBeParent.mockResolvedValue(false);
    expect((await impersonate("c1")).statusCode).toBe(403);
    expect(mockPrisma.impersonationLog.create).not.toHaveBeenCalled();
  });

  it("non-child and unknown child get the same generic 403 body", async () => {
    mockIsChildOf.mockResolvedValue(false);
    const a = await impersonate("someone-elses");
    const b = await impersonate("does-not-exist");
    expect(a.statusCode).toBe(403);
    expect(a.json()).toEqual({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });
    expect(b.json()).toEqual(a.json());
    expect(mockPrisma.impersonationLog.create).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("refuses a superAdmin target with the generic 403 (the lookup also excludes them)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "sa-9", role: "superAdmin" });
    const res = await impersonate("c1", { userId: "sa-9" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.impersonationLog.create).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("an explicit userId is looked up only inside the child org, active and not deleted", async () => {
    await impersonate("c1", { userId: "cu-5" });
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cu-5", organizationId: "c1", isActive: true, deletedAt: null } }),
    );
  });

  it("defaults to the child's oldest active admin", async () => {
    await impersonate("c1");
    const arg = mockPrisma.user.findFirst.mock.calls[0]![0];
    expect(arg.where).toEqual({ organizationId: "c1", role: "admin", isActive: true, deletedAt: null });
    expect(arg.orderBy).toEqual({ createdAt: "asc" });
  });

  it("generic 403 when the child has no active admin", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });
  });

  it("writes the log row BEFORE the Redis key, then the parent audit event", async () => {
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(200);
    expect(calls.order).toEqual(["log", "redis", "audit"]);
    const body = res.json<{ data: { token: string; expiresIn: number; mode: string } }>().data;
    expect(body.expiresIn).toBe(900);
    expect(body.mode).toBe("readonly");
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);

    expect(mockPrisma.impersonationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "pu-1",
        organizationId: "c1",
        actorOrganizationId: "p1",
        targetUserId: "cu-1",
        mode: "readonly",
        token: body.token,
      }),
    });
    const [key, value, ex, ttl] = mockRedis.set.mock.calls[0]!;
    expect(key).toBe(`impersonate:${body.token}`);
    expect(JSON.parse(value as string)).toEqual({
      organizationId: "c1",
      targetUserId: "cu-1",
      issuedBy: "pu-1",
      issuedSid: "sid-1",
      issuedByOrgId: "p1",
      mode: "readonly",
    });
    expect([ex, ttl]).toEqual(["EX", 900]);
    expect(mockPrisma.parentAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentOrganizationId: "p1",
        childOrganizationId: "c1",
        actorUserId: "pu-1",
        action: "impersonate_started",
        metadata: expect.objectContaining({ targetUserId: "cu-1", mode: "readonly" }),
      }),
    });
  });

  it("no Redis key when the log write throws", async () => {
    mockPrisma.impersonationLog.create.mockRejectedValue(new Error("db down"));
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(500);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("revokes the token and closes the log when the audit event cannot be written", async () => {
    mockPrisma.parentAuditEvent.create.mockRejectedValue(new Error("db down"));
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(500);
    expect(mockRedis.del).toHaveBeenCalledWith(expect.stringMatching(/^impersonate:[0-9a-f]{64}$/));
    expect(mockPrisma.impersonationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { endedAt: expect.any(Date) } }),
    );
  });

  it("the 11th request in an hour is 429", async () => {
    mockRedis.incr.mockResolvedValue(11);
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(429);
    expect(mockPrisma.impersonationLog.create).not.toHaveBeenCalled();
    mockRedis.incr.mockResolvedValue(10);
    expect((await impersonate("c1")).statusCode).toBe(200);
  });

  it("refuses to run inside any impersonation session (no nested sessions)", async () => {
    auth = { ...baseAuth, impersonation: { adminId: "pu-1", mode: "edit", parentOrganizationId: "p1" } };
    const res = await impersonate("c1");
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.impersonationLog.create).not.toHaveBeenCalled();
  });
});

describe("parent session elevate and end", () => {
  const livePayload = {
    organizationId: "c1",
    targetUserId: "cu-1",
    issuedBy: "pu-1",
    issuedSid: "sid-1",
    issuedByOrgId: "p1",
    mode: "readonly",
  };
  const elevate = (body: unknown, childId = "c1") =>
    app.inject({ method: "POST", url: `/v1/parent/children/${childId}/impersonate/elevate`, payload: body as object });
  const end = (body: unknown, childId = "c1") =>
    app.inject({ method: "DELETE", url: `/v1/parent/children/${childId}/impersonate`, payload: body as object });
  const reason = "Customer asked us to fix the template";

  beforeEach(() => {
    mockRedis.get.mockResolvedValue(JSON.stringify(livePayload));
  });

  it("rejects a reason outside 10-500 characters", async () => {
    expect((await elevate({ token: "t", reason: "short" })).statusCode).toBe(400);
    expect((await elevate({ token: "t", reason: "x".repeat(501) })).statusCode).toBe(400);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("elevates: log first, TTL preserved with PX, parent audit event", async () => {
    mockPrisma.impersonationLog.updateMany.mockImplementation(async () => {
      calls.order.push("log");
      return { count: 1 };
    });
    const res = await elevate({ token: "t", reason });
    expect(res.statusCode).toBe(200);
    expect(calls.order).toEqual(["log", "redis", "audit"]);
    expect(mockPrisma.impersonationLog.updateMany).toHaveBeenCalledWith({
      where: { token: "t", actorId: "pu-1", endedAt: null },
      data: { mode: "edit", elevationReason: reason },
    });
    const [key, value, px, ttl] = mockRedis.set.mock.calls[0]!;
    expect(key).toBe("impersonate:t");
    expect(JSON.parse(value as string)).toEqual({ ...livePayload, mode: "edit" });
    expect([px, ttl]).toEqual(["PX", 600_000]);
    expect(mockPrisma.parentAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "impersonate_elevated", childOrganizationId: "c1", actorUserId: "pu-1" }),
    });
  });

  it("only the issuer can elevate (another admin of the same parent org gets 403)", async () => {
    auth = { ...baseAuth, userId: "pu-2" };
    const res = await elevate({ token: "t", reason });
    expect(res.statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("only the issuing session can elevate", async () => {
    auth = { ...baseAuth, sid: "sid-other" };
    expect((await elevate({ token: "t", reason })).statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("cannot elevate from inside an impersonation session", async () => {
    auth = { ...baseAuth, impersonation: { adminId: "pu-1", mode: "readonly", parentOrganizationId: "p1" } };
    expect((await elevate({ token: "t", reason })).statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("refuses a super-admin token (no issuedByOrgId) and a token for another child", async () => {
    const superAdminPayload: Record<string, unknown> = { ...livePayload };
    delete superAdminPayload["issuedByOrgId"];
    mockRedis.get.mockResolvedValue(JSON.stringify(superAdminPayload));
    expect((await elevate({ token: "t", reason })).statusCode).toBe(404);
    mockRedis.get.mockResolvedValue(JSON.stringify({ ...livePayload, issuedByOrgId: "p9" }));
    expect((await elevate({ token: "t", reason })).statusCode).toBe(404);
    mockRedis.get.mockResolvedValue(JSON.stringify(livePayload));
    mockIsChildOf.mockResolvedValue(false);
    expect((await elevate({ token: "t", reason })).statusCode).toBe(403);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("no Redis write when no open log row matches", async () => {
    mockPrisma.impersonationLog.updateMany.mockResolvedValue({ count: 0 });
    expect((await elevate({ token: "t", reason })).statusCode).toBe(404);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("already elevated is 409", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ ...livePayload, mode: "edit" }));
    expect((await elevate({ token: "t", reason })).statusCode).toBe(409);
  });

  it("the issuer ends the session: key deleted and endedAt set", async () => {
    const res = await end({ token: "t" });
    expect(res.statusCode).toBe(204);
    expect(mockRedis.del).toHaveBeenCalledWith("impersonate:t");
    expect(mockPrisma.impersonationLog.updateMany).toHaveBeenCalledWith({
      where: { token: "t", actorId: "pu-1", endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
  });

  it("someone other than the issuer cannot end it", async () => {
    auth = { ...baseAuth, userId: "pu-2" };
    expect((await end({ token: "t" })).statusCode).toBe(403);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("a super-admin token cannot be ended through the parent route", async () => {
    const superAdminPayload: Record<string, unknown> = { ...livePayload };
    delete superAdminPayload["issuedByOrgId"];
    mockRedis.get.mockResolvedValue(JSON.stringify({ ...superAdminPayload, issuedBy: "pu-1" }));
    expect((await end({ token: "t" })).statusCode).toBe(403);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});
