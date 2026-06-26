import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  leadStatus: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
  contact: { count: vi.fn(), updateMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};

let auth = { userId: "user-1", organizationId: "org-1", role: "admin" as string, permissions: {} as Record<string, string> };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = auth as typeof req.auth; });
  const { leadStatusesRouter } = await import("./lead-statuses.js");
  await app.register(leadStatusesRouter, { prefix: "/v1" });
  return app;
}

describe("lead-statuses API", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    auth = { userId: "user-1", organizationId: "org-1", role: "admin", permissions: {} };
    // Safe defaults for the DELETE guard's extra checks (not referenced)
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: false }]);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("GET lists statuses ordered by sortOrder", async () => {
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "s1", sortOrder: 0 }, { id: "s2", sortOrder: 1 }]);
    const res = await app.inject({ method: "GET", url: "/v1/lead-statuses" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.leadStatus.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1" }, orderBy: { sortOrder: "asc" },
    }));
  });

  it("POST ignores isClosure in body — field is dropped", async () => {
    mockPrisma.leadStatus.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockPrisma.leadStatus.create.mockResolvedValue({ id: "s-new", organizationId: "org-1", name: "Won", color: "#10B981", sortOrder: 0 });
    const res = await app.inject({
      method: "POST",
      url: "/v1/lead-statuses",
      payload: { name: "Won", color: "#10B981", isClosure: true },
    });
    expect(res.statusCode).toBe(201);
    const createArg = mockPrisma.leadStatus.create.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(createArg.data).not.toHaveProperty("isClosure");
  });

  it("PATCH ignores isClosure in body", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1", name: "Old", color: "#aaa", sortOrder: 0 });
    mockPrisma.leadStatus.update.mockResolvedValue({ id: "s1", organizationId: "org-1", name: "Old", color: "#bbb", sortOrder: 0 });
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/s1", payload: { color: "#bbb", isClosure: false } });
    expect(res.statusCode).toBe(200);
    const updateArg = mockPrisma.leadStatus.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(updateArg.data).not.toHaveProperty("isClosure");
  });

  it("POST appends with sortOrder = max + 1", async () => {
    mockPrisma.leadStatus.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    mockPrisma.leadStatus.create.mockResolvedValue({ id: "s3", name: "Won", color: "#10B981", sortOrder: 5 });
    const res = await app.inject({ method: "POST", url: "/v1/lead-statuses", payload: { name: "Won", color: "#10B981" } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.leadStatus.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", name: "Won", color: "#10B981", sortOrder: 5 }),
    }));
  });

  it("DELETE cascades contacts to null and deletes the status", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<void>) => fn(mockPrisma)
    );
    mockPrisma.contact.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.leadStatus.delete.mockResolvedValue({ id: "s1" });

    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });

    expect(res.statusCode).toBe(204);
    expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", leadStatusId: "s1" },
      data: { leadStatusId: null },
    });
    expect(mockPrisma.leadStatus.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("PATCH /reorder rewrites sortOrder to match the given order", async () => {
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mockPrisma.$transaction.mockResolvedValue([]);
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/reorder", payload: { orderedIds: ["c", "a", "b"] } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("POST returns 403 without manage_contacts permission", async () => {
    auth = { userId: "u", organizationId: "org-1", role: "agent", permissions: { some_other: "allow" } };
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/lead-statuses", payload: { name: "X", color: "#FACC15" } });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH /:id returns 404 when status not found", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/s1", payload: { name: "Updated" } });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("NOT_FOUND");
  });

  it("PATCH /:id returns 200 and updates when status exists", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1", name: "Old", color: "#000000" });
    mockPrisma.leadStatus.update.mockResolvedValue({ id: "s1", name: "Updated", color: "#FFFFFF" });
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/s1", payload: { name: "Updated", color: "#FFFFFF" } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.leadStatus.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s1" },
      data: expect.objectContaining({ name: "Updated", color: "#FFFFFF" }),
    }));
  });

  it("PATCH /reorder returns 400 (INVALID_ORDER) when orderedIds does not match org's id set", async () => {
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/reorder", payload: { orderedIds: ["a"] } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_ORDER");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("PATCH /reorder passes correct sortOrder values in transaction", async () => {
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mockPrisma.$transaction.mockResolvedValue([]);
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/reorder", payload: { orderedIds: ["c", "a", "b"] } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const transactionArg = mockPrisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(transactionArg)).toBe(true);
    expect(transactionArg.length).toBe(3);
  });

  it("PATCH /:id returns 403 without manage_contacts permission", async () => {
    auth = { userId: "u", organizationId: "org-1", role: "agent", permissions: { other: "allow" } };
    app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/s1", payload: { name: "X" } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.leadStatus.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.leadStatus.update).not.toHaveBeenCalled();
  });

  it("DELETE returns 403 without manage_contacts permission", async () => {
    auth = { userId: "u", organizationId: "org-1", role: "agent", permissions: { other: "allow" } };
    app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.leadStatus.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.leadStatus.delete).not.toHaveBeenCalled();
  });

  it("PATCH /reorder returns 403 without manage_contacts permission", async () => {
    auth = { userId: "u", organizationId: "org-1", role: "agent", permissions: { other: "allow" } };
    app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/reorder", payload: { orderedIds: ["a"] } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.leadStatus.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("POST returns 409 DUPLICATE_NAME on unique violation", async () => {
    mockPrisma.leadStatus.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
    mockPrisma.leadStatus.create.mockRejectedValue({ code: "P2002" });
    const res = await app.inject({ method: "POST", url: "/v1/lead-statuses", payload: { name: "New Lead", color: "#F97316" } });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("DUPLICATE_NAME");
  });

  it("DELETE returns 409 when status is a default/closure status in settings", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: { contactConfig: { defaultLeadStatusId: "s1", closureLeadStatusIds: [] } } });
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("STATUS_IN_USE");
    expect(mockPrisma.leadStatus.delete).not.toHaveBeenCalled();
  });

  it("DELETE returns 409 when status is referenced by a flow", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.leadStatus.delete).not.toHaveBeenCalled();
  });

  it("POST returns 400 INVALID_NAME when name contains special characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/lead-statuses",
      payload: { name: "New@Lead!", color: "#3B82F6" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_NAME");
    expect(mockPrisma.leadStatus.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id returns 400 INVALID_NAME when name contains special characters", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1", name: "Old", color: "#000" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/lead-statuses/s1",
      payload: { name: "Bad#Name" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_NAME");
    expect(mockPrisma.leadStatus.update).not.toHaveBeenCalled();
  });
});
