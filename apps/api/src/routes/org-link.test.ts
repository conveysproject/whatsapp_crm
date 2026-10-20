import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { isChildOf, ParentLinkError } from "../lib/parent-orgs.js";

const mockPrisma: Record<string, any> = vi.hoisted(() => ({
  $transaction: vi.fn(),
  organization: { findUnique: vi.fn(), updateMany: vi.fn() },
  impersonationLog: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  parentAuditEvent: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const baseAuth = {
  userId: "u-child",
  organizationId: "child-1",
  role: "admin" as "admin" | "manager",
  permissions: {} as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};
let auth: typeof baseAuth = baseAuth;
let app: FastifyInstance;
const tx = { $queryRaw: vi.fn(), organization: mockPrisma.organization, parentAuditEvent: mockPrisma.parentAuditEvent };

/** In-memory org rows keyed by id, so the link state is real across calls. */
const orgs = new Map<string, { parentOrganizationId: string | null; parentName?: string }>();

beforeEach(async () => {
  vi.clearAllMocks();
  process.env["PARENT_ORGS_ENABLED"] = "true";
  auth = baseAuth;
  orgs.clear();
  orgs.set("child-1", { parentOrganizationId: "parent-1", parentName: "Agency Co" });
  orgs.set("orgB", { parentOrganizationId: null });
  mockPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
  tx.$queryRaw.mockResolvedValue([]);
  mockPrisma.organization.findUnique.mockImplementation(async ({ where, select }: any) => {
    const o = orgs.get(where.id);
    if (!o) return null;
    if (select?.parentOrganization) {
      return { parentOrganization: o.parentOrganizationId ? { id: o.parentOrganizationId, name: o.parentName } : null };
    }
    return { parentOrganizationId: o.parentOrganizationId };
  });
  mockPrisma.organization.updateMany.mockImplementation(async ({ where, data }: any) => {
    const o = orgs.get(where.id);
    if (!o || o.parentOrganizationId !== where.parentOrganizationId) return { count: 0 };
    o.parentOrganizationId = data.parentOrganizationId;
    return { count: 1 };
  });
  mockPrisma.parentAuditEvent.create.mockResolvedValue({});
  mockPrisma.impersonationLog.findMany.mockResolvedValue([]);
  mockPrisma.parentAuditEvent.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = auth;
  });
  const { orgLinkRoutes } = await import("./org-link.js");
  await app.register(orgLinkRoutes, { prefix: "/v1" });
});
afterEach(async () => {
  await app.close();
  delete process.env["PARENT_ORGS_ENABLED"];
});

const get = () => app.inject({ method: "GET", url: "/v1/organization/parent-link" });
const post = () => app.inject({ method: "POST", url: "/v1/organization/leave-parent" });

describe("gates", () => {
  it("flag off => 404 on both routes, nothing queried", async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    expect((await get()).statusCode).toBe(404);
    expect((await post()).statusCode).toBe(404);
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it("non-admin => 403 on both routes, nothing queried or changed", async () => {
    auth = { ...baseAuth, role: "manager" };
    const g = await get();
    const p = await post();
    expect(g.statusCode).toBe(403);
    expect(p.statusCode).toBe(403);
    expect(g.json().error.code).toBe("FORBIDDEN");
    expect(mockPrisma.impersonationLog.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(orgs.get("child-1")!.parentOrganizationId).toBe("parent-1");
  });
});

describe("GET /organization/parent-link", () => {
  it("returns the parent name only, never its id", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.parent).toEqual({ name: "Agency Co" });
    expect(res.body).not.toContain("parent-1");
  });

  it("org without a parent returns parent: null", async () => {
    auth = { ...baseAuth, organizationId: "orgB" };
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.parent).toBeNull();
    expect(res.json().data.sessions).toEqual([]);
  });

  it("history survives unlinking: parent null but past parent sessions listed", async () => {
    orgs.get("child-1")!.parentOrganizationId = null;
    mockPrisma.impersonationLog.findMany.mockResolvedValue([
      { id: "l1", actorId: "pu1", startedAt: new Date("2026-10-01T00:00:00Z"), endedAt: null, mode: "readonly" },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "pu1", fullName: "Ann Parent" }]);
    const res = await get();
    expect(res.json().data.parent).toBeNull();
    expect(res.json().data.sessions).toHaveLength(1);
  });

  it("queries only the caller's org, parent sessions only, newest first, limit 50 (exact where)", async () => {
    await get();
    expect(mockPrisma.impersonationLog.findMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.impersonationLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ organizationId: "child-1", actorOrganizationId: { not: null } });
    expect(arg.orderBy).toEqual({ startedAt: "desc" });
    expect(arg.take).toBe(50);
  });

  it("cross-tenant: org B's query is scoped to org B, never org A", async () => {
    auth = { ...baseAuth, organizationId: "orgB" };
    await get();
    expect(mockPrisma.impersonationLog.findMany.mock.calls[0][0].where.organizationId).toBe("orgB");
  });

  it("returns actor names, 'Parent user' for a deleted actor, and no token/ip/ua/reason", async () => {
    mockPrisma.impersonationLog.findMany.mockResolvedValue([
      { id: "l1", actorId: "pu1", startedAt: new Date("2026-10-02T00:00:00Z"), endedAt: new Date("2026-10-02T00:10:00Z"), mode: "edit",
        token: "test-token", ipAddress: "9.9.9.9", userAgent: "UA-X", elevationReason: "fix their template" },
      { id: "l2", actorId: "gone", startedAt: new Date("2026-10-01T00:00:00Z"), endedAt: null, mode: "readonly" },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "pu1", fullName: "Ann Parent" }]);
    const res = await get();
    expect(res.json().data.sessions).toEqual([
      { id: "l1", startedAt: "2026-10-02T00:00:00.000Z", endedAt: "2026-10-02T00:10:00.000Z", mode: "edit", actorName: "Ann Parent" },
      { id: "l2", startedAt: "2026-10-01T00:00:00.000Z", endedAt: null, mode: "readonly", actorName: "Parent user" },
    ]);
    expect(res.body).not.toMatch(/test-token|9\.9\.9\.9|UA-X|fix their template|elevation/i);
    const sel = mockPrisma.impersonationLog.findMany.mock.calls[0][0].select;
    expect(Object.keys(sel).sort()).toEqual(["actorId", "endedAt", "id", "mode", "startedAt"]);
  });

  it("D13: lists the parent's message reads for the caller's org only (exact query)", async () => {
    await get();
    expect(mockPrisma.parentAuditEvent.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.parentAuditEvent.findMany).toHaveBeenCalledWith({
      where: { childOrganizationId: "child-1", action: "content_read" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, actorUserId: true, metadata: true },
    });
    auth = { ...baseAuth, organizationId: "orgB" };
    await get();
    expect(mockPrisma.parentAuditEvent.findMany.mock.calls[1][0].where).toEqual({ childOrganizationId: "orgB", action: "content_read" });
  });

  it("content reads: actor name, numeric count only, never the cursor, message ids or the parent id", async () => {
    mockPrisma.parentAuditEvent.findMany.mockResolvedValue([
      { createdAt: new Date("2026-10-03T00:00:00Z"), actorUserId: "pu1", metadata: { count: 12, cursor: "msg-cursor-id", messageIds: ["m-1"] },
        parentOrganizationId: "parent-1", id: "ev-1" },
      { createdAt: new Date("2026-10-02T00:00:00Z"), actorUserId: null, metadata: { count: "7" } },
      { createdAt: new Date("2026-10-01T00:00:00Z"), actorUserId: "gone", metadata: null },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "pu1", fullName: "Ann Parent" }]);
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.contentReads).toEqual([
      { at: "2026-10-03T00:00:00.000Z", actorName: "Ann Parent", count: 12 },
      { at: "2026-10-02T00:00:00.000Z", actorName: "Parent user", count: null },
      { at: "2026-10-01T00:00:00.000Z", actorName: "Parent user", count: null },
    ]);
    expect(res.body).not.toMatch(/msg-cursor-id|m-1|ev-1|parent-1/);
    // One user lookup for sessions and reads together, and only for ids that exist.
    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(["gone", "pu1"]);
  });

  it("contentReads is an empty list when there are none", async () => {
    auth = { ...baseAuth, organizationId: "orgB" };
    expect((await get()).json().data.contentReads).toEqual([]);
  });
});

describe("POST /organization/leave-parent", () => {
  it("clears the link and writes the audit event via unlinkChild", async () => {
    const res = await post();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { left: true } });
    expect(orgs.get("child-1")!.parentOrganizationId).toBeNull();
    expect(mockPrisma.parentAuditEvent.create).toHaveBeenCalledWith({
      data: { parentOrganizationId: "parent-1", childOrganizationId: "child-1", actorUserId: "u-child", action: "unlinked_by_child" },
    });
  });

  it("not linked => 409 NOT_LINKED, no audit", async () => {
    auth = { ...baseAuth, organizationId: "orgB" };
    const res = await post();
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_LINKED");
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
  });

  it("ORG_NOT_FOUND => 404", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new ParentLinkError("ORG_NOT_FOUND"));
    expect((await post()).statusCode).toBe(404);
  });

  it("after leaving, the parent's isChildOf re-check fails on the next request", async () => {
    expect(await isChildOf(mockPrisma as unknown as PrismaClient, "parent-1", "child-1")).toBe(true);
    expect((await post()).statusCode).toBe(200);
    expect(await isChildOf(mockPrisma as unknown as PrismaClient, "parent-1", "child-1")).toBe(false);
  });
});
