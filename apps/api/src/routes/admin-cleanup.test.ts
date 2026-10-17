import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const clerk = vi.hoisted(() => ({ getClerkUser: vi.fn() }));
vi.mock("../lib/clerk-admin.js", () => clerk);
vi.mock("../lib/redis.js", () => ({ redis: {} }));
vi.mock("../lib/mail.js", () => ({ sendMail: vi.fn(), isEmailConfigured: vi.fn() }));

const mockPrisma = {
  organization: { findMany: vi.fn(), deleteMany: vi.fn() },
  authAccount: { findUnique: vi.fn() },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
};
const auth = { userId: "sa-1", organizationId: "platform", role: "superAdmin" as const, permissions: {}, teamId: null, teamRole: null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = auth; });
  const { adminRouter } = await import("./admin.js");
  await app.register(adminRouter, { prefix: "/v1" });
  return app;
}

describe("GET /admin/organizations/cleanup", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: "o-good", name: "Good", users: [{ id: "usr_ok", role: "admin" }] },
      { id: "o-bad", name: "Bad", users: [{ id: "usr_locked", role: "admin" }, { id: "usr_gone", role: "agent" }] },
    ]);
  });
  afterEach(async () => { delete process.env.AUTH_PROVIDER; await app.close(); });

  it("wbmsg: an org is valid only with an active auth account, and Clerk is not called", async () => {
    process.env.AUTH_PROVIDER = "wbmsg";
    mockPrisma.authAccount.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "usr_ok" ? { status: "active" } : where.id === "usr_locked" ? { status: "disabled" } : null);
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations/cleanup" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted.map((o: { id: string }) => o.id)).toEqual(["o-bad"]);
    expect(clerk.getClerkUser).not.toHaveBeenCalled();
  });

  it("clerk: still checks Clerk", async () => {
    delete process.env.AUTH_PROVIDER;
    clerk.getClerkUser.mockImplementation(async (id: string) => { if (id !== "usr_ok") throw new Error("nf"); return {}; });
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations/cleanup" });
    expect(res.json().data.deleted.map((o: { id: string }) => o.id)).toEqual(["o-bad"]);
    expect(mockPrisma.authAccount.findUnique).not.toHaveBeenCalled();
  });
});
