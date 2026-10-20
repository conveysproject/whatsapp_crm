import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type * as ParentOrgsModule from "../lib/parent-orgs.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockCanBeParent = vi.hoisted(() => vi.fn());
vi.mock("../lib/parent-orgs.js", async (orig) => ({
  ...(await orig<typeof ParentOrgsModule>()),
  canBeParent: (...a: unknown[]) => mockCanBeParent(...a),
}));

const state = vi.hoisted(() => ({ children: [] as Array<{ id: string; parent: string }> }));
const mockPrisma: Record<string, any> = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  organization: { findMany: vi.fn(), findUnique: vi.fn() },
  message: { findMany: vi.fn(), findFirst: vi.fn() },
  parentAuditEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const adminAuth = {
  userId: "user-1",
  organizationId: "p1",
  role: "admin" as "admin" | "manager",
  permissions: {} as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};
let auth: typeof adminAuth = adminAuth;

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
beforeEach(async () => {
  vi.clearAllMocks();
  process.env["PARENT_ORGS_ENABLED"] = "true";
  auth = adminAuth;
  state.children = [
    { id: "c1", parent: "p1" },
    { id: "c2", parent: "p1" },
    { id: "x1", parent: "p2" },
  ];
  mockCanBeParent.mockResolvedValue(true);
  mockPrisma.organization.findMany.mockImplementation(async ({ where }: any) =>
    state.children.filter((c) => c.parent === where.parentOrganizationId).map((c) => ({ id: c.id })),
  );
  mockPrisma.organization.findUnique.mockImplementation(async ({ where }: any) => {
    const c = state.children.find((x) => x.id === where.id);
    return c ? { parentOrganizationId: c.parent } : null;
  });
  mockPrisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const t = strings.join("?");
    const ids = values[0] as string[];
    if (t.includes("FROM organizations")) return ids.map((id) => ({ id, name: `N ${id}`, waba_connected: true }));
    if (t.includes("LATERAL")) return [];
    return ids.map((id) => ({ organization_id: id, sent: 1, delivered: 1, read: 1, failed: 0, received: 1 }));
  });
  mockPrisma.message.findMany.mockResolvedValue([
    { id: "m1", direction: "inbound", contentType: "text", body: "secret text", status: "read", isSystemMessage: false,
      sentAt: new Date(), createdAt: new Date(), conversation: { contact: { phoneNumber: "+1", name: "A" } } },
  ]);
  mockPrisma.message.findFirst.mockResolvedValue({ id: "m0" });
  mockPrisma.parentAuditEvent.create.mockResolvedValue({});
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  delete process.env["PARENT_ORGS_ENABLED"];
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("DELETE /parent/children/:childId", () => {
  const del = (id: string) => app.inject({ method: "DELETE", url: `/v1/parent/children/${id}` });
  beforeEach(() => {
    mockPrisma.organization.updateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn({ $queryRaw: vi.fn().mockResolvedValue([]), organization: mockPrisma.organization, parentAuditEvent: mockPrisma.parentAuditEvent }),
    );
  });
  it("removes an own child and writes unlinked_by_parent", async () => {
    const res = await del("c1");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { removed: true } });
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", parentOrganizationId: "p1" },
      data: { parentOrganizationId: null },
    });
    expect(mockPrisma.parentAuditEvent.create).toHaveBeenCalledWith({
      data: { parentOrganizationId: "p1", childOrganizationId: "c1", actorUserId: "user-1", action: "unlinked_by_parent" },
    });
  });
  it("another parent's child, an unknown id and yourself all get the identical generic 403", async () => {
    const bodies = [];
    for (const id of ["x1", "nope", "p1"]) {
      const res = await del(id);
      expect(res.statusCode).toBe(403);
      bodies.push(res.body);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it("manager => 403, nothing changed", async () => {
    auth = { ...adminAuth, role: "manager" };
    expect((await del("c1")).statusCode).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it("flag off => 404", async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    expect((await del("c1")).statusCode).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it("non-parent org => 403", async () => {
    mockCanBeParent.mockResolvedValue(false);
    expect((await del("c1")).statusCode).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
const rawCallIds = () => mockPrisma.$queryRaw.mock.calls.map((c: unknown[]) => c[1]);

describe("gates", () => {
  const urls = [
    "/v1/parent/children",
    "/v1/parent/dashboard",
    "/v1/parent/children/c1/stats",
    "/v1/parent/children/c1/messages",
  ];
  it.each(urls)("flag off => 404 for %s", async (u) => {
    delete process.env["PARENT_ORGS_ENABLED"];
    const res = await get(u);
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
  });
  it.each(urls)("manager => 403 for %s, no audit row", async (u) => {
    auth = { ...adminAuth, role: "manager" };
    const res = await get(u);
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
  });
  it.each(urls)("D15 admin only: manager WITH parent_access granted => 403 for %s, nothing read", async (u) => {
    auth = { ...adminAuth, role: "manager", permissions: { parent_access: "allow" } };
    const res = await get(u);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
    expect(mockCanBeParent).not.toHaveBeenCalled();
  });
  it("D15 admin only: manager WITH parent_access granted cannot remove a child", async () => {
    auth = { ...adminAuth, role: "manager", permissions: { parent_access: "allow" } };
    const res = await app.inject({ method: "DELETE", url: "/v1/parent/children/c1" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(urls)("non-parent org => 403 for %s", async (u) => {
    mockCanBeParent.mockResolvedValue(false);
    expect((await get(u)).statusCode).toBe(403);
  });
});

describe("GET /parent/children and /parent/dashboard", () => {
  it("lists only the caller's children and passes exactly those ids to queries", async () => {
    const res = await get("/v1/parent/children");
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((c: any) => c.orgId)).toEqual(["c1", "c2"]);
    for (const ids of rawCallIds()) expect(ids).toEqual(["c1", "c2"]);
  });
  it("dashboard returns children, totals and range", async () => {
    const res = await get("/v1/parent/dashboard?from=2026-10-01T00:00:00Z&to=2026-10-05T00:00:00Z");
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.children).toHaveLength(2);
    expect(d.totals).toMatchObject({ sent: 2, delivered: 2, read: 2, failed: 0, received: 2 });
    expect(d.range.from).toBe("2026-10-01T00:00:00.000Z");
  });
  it("never leaks wabaAccessToken", async () => {
    const res = await get("/v1/parent/dashboard");
    expect(res.body).not.toMatch(/wabaAccessToken|waba_access_token/i);
  });
  it("an unlinked child disappears from the next call", async () => {
    expect((await get("/v1/parent/children")).json().data).toHaveLength(2);
    state.children = state.children.filter((c) => c.id !== "c2");
    mockPrisma.$queryRaw.mockClear();
    expect((await get("/v1/parent/children")).json().data.map((c: any) => c.orgId)).toEqual(["c1"]);
    for (const ids of rawCallIds()) expect(ids).toEqual(["c1"]);
  });
  it("rejects from > to", async () => {
    const res = await get("/v1/parent/dashboard?from=2026-10-05T00:00:00Z&to=2026-10-01T00:00:00Z");
    expect(res.statusCode).toBe(400);
  });
  it("rejects a range over 366 days", async () => {
    const res = await get("/v1/parent/dashboard?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.statusCode).toBe(400);
  });
  it("rejects unparsable dates", async () => {
    expect((await get("/v1/parent/dashboard?from=garbage")).statusCode).toBe(400);
  });
  it("defaults to the last 30 days", async () => {
    const res = await get("/v1/parent/dashboard");
    const { from, to } = res.json().data.range;
    expect(Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)).toBe(30);
  });
});

describe("GET /parent/children/:childId/stats", () => {
  it("returns stats for a current child", async () => {
    const res = await get("/v1/parent/children/c1/stats");
    expect(res.statusCode).toBe(200);
    expect(res.json().data.orgId).toBe("c1");
    for (const ids of rawCallIds()) expect(ids).toEqual(["c1"]);
  });
  it("another parent's child, an unknown id and the caller itself give identical 403 bodies", async () => {
    const other = await get("/v1/parent/children/x1/stats");
    const unknown = await get("/v1/parent/children/nope/stats");
    const self = await get("/v1/parent/children/p1/stats");
    expect(other.statusCode).toBe(403);
    expect(other.json()).toEqual({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });
    expect(unknown.body).toBe(other.body);
    expect(self.body).toBe(other.body);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /parent/children/:childId/messages", () => {
  it("returns bodies and writes exactly one content_read audit row", async () => {
    const res = await get("/v1/parent/children/c1/messages?limit=20&cursor=m0");
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toMatchObject({ id: "m1", body: "secret text", contactPhone: "+1" });
    expect(mockPrisma.parentAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.parentAuditEvent.create).toHaveBeenCalledWith({
      data: {
        parentOrganizationId: "p1",
        childOrganizationId: "c1",
        actorUserId: "user-1",
        action: "content_read",
        metadata: { count: 1, cursor: "m0" },
      },
    });
    expect(res.body).not.toMatch(/wabaAccessToken/i);
  });
  it("403 for a foreign child: no data query, no audit row, identical body", async () => {
    const res = await get("/v1/parent/children/x1/messages");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
  });
  it("unknown id and the caller's own id give a byte-identical 403", async () => {
    const foreign = await get("/v1/parent/children/x1/messages");
    for (const id of ["nope", "p1"]) {
      const res = await get(`/v1/parent/children/${id}/messages`);
      expect(res.statusCode).toBe(403);
      expect(res.body).toBe(foreign.body);
    }
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
  });
  it("a cursor from another org gives 400 INVALID_CURSOR, never reads, no audit row", async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);
    const res = await get("/v1/parent/children/c1/messages?cursor=foreign-msg");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_CURSOR");
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
  });
  it("a childId over 64 chars is rejected by validation (400), nothing is read", async () => {
    const res = await get(`/v1/parent/children/${"a".repeat(65)}/messages`);
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
  });
  it("fails closed when the audit row cannot be written", async () => {
    mockPrisma.parentAuditEvent.create.mockRejectedValue(new Error("db down"));
    const res = await get("/v1/parent/children/c1/messages");
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret text");
  });
  it("refuses while impersonating (a super admin acting as the parent admin): generic 403, no read, no audit row", async () => {
    auth = { ...adminAuth, impersonation: { adminId: "sa-1", mode: "readonly" } } as typeof adminAuth;
    const res = await get("/v1/parent/children/c1/messages");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.parentAuditEvent.create).not.toHaveBeenCalled();
  });
  it("caps limit at 100 via schema", async () => {
    expect((await get("/v1/parent/children/c1/messages?limit=101")).statusCode).toBe(400);
  });
});

describe("rate limit on messages", () => {
  it("returns 429 on request 61 within the window", async () => {
    const rl = Fastify({ logger: false });
    const { default: rateLimit } = await import("@fastify/rate-limit");
    await rl.register(rateLimit, { global: false });
    rl.addHook("onRequest", async (request) => {
      request.auth = auth;
    });
    const { parentRoutes } = await import("./parent.js");
    await rl.register(parentRoutes, { prefix: "/v1" });
    let last = 0;
    for (let i = 0; i < 61; i++) {
      last = (await rl.inject({ method: "GET", url: "/v1/parent/children/c1/messages" })).statusCode;
      if (i < 60) expect(last).toBe(200);
    }
    expect(last).toBe(429);
    await rl.close();
  });
});
