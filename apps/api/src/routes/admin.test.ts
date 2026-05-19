import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
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
};

// SuperAdmin auth
const mockAdminAuth = { userId: "sa-1", organizationId: "platform", role: "superAdmin" as const, permissions: {} };

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
      { id: "org-1", name: "Acme Corp", status: "active" },
      { id: "org-2", name: "Beta Ltd", status: "active" },
    ]);
    mockPrisma.organization.count.mockResolvedValue(2);
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(2);
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
      req.auth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };
    });
    const { adminRouter } = await import("./admin.js");
    await appAsAdmin.register(adminRouter, { prefix: "/v1" });
  });
  afterEach(async () => { await appAsAdmin.close(); });

  it("returns 403 for non-superAdmin", async () => {
    const res = await appAsAdmin.inject({ method: "GET", url: "/v1/admin/organizations" });
    expect(res.statusCode).toBe(403);
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
