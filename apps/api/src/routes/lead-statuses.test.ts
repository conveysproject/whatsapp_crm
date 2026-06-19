import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  leadStatus: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
  contact: { count: vi.fn() },
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

  it("POST appends with sortOrder = max + 1", async () => {
    mockPrisma.leadStatus.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    mockPrisma.leadStatus.create.mockResolvedValue({ id: "s3", name: "Won", color: "#10B981", sortOrder: 5 });
    const res = await app.inject({ method: "POST", url: "/v1/lead-statuses", payload: { name: "Won", color: "#10B981" } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.leadStatus.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", name: "Won", color: "#10B981", sortOrder: 5 }),
    }));
  });

  it("DELETE returns 409 when contacts reference the status", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.contact.count.mockResolvedValue(3);
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("STATUS_IN_USE");
    expect(mockPrisma.leadStatus.delete).not.toHaveBeenCalled();
  });

  it("DELETE returns 204 when no contacts reference the status", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.contact.count.mockResolvedValue(0);
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(204);
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
});
