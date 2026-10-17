import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const clerk = vi.hoisted(() => ({
  createClerkSuperAdmin: vi.fn(),
  verifyBootstrapSecret: vi.fn(() => true),
  isBootstrapEnabled: vi.fn(() => true),
}));
vi.mock("../lib/clerk-admin.js", () => clerk);
const revoke = vi.hoisted(() => ({ revokeAllSessions: vi.fn().mockResolvedValue(0) }));
vi.mock("../auth/sessions.js", () => revoke);
vi.mock("../lib/redis.js", () => ({ redis: { incr: vi.fn().mockResolvedValue(1) } }));

const tx = {
  authAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
};
const mockPrisma = {
  user: { findFirst: vi.fn() },
  organization: { upsert: vi.fn() },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { bootstrapRouter } = await import("./bootstrap.js");
  await app.register(bootstrapRouter, { prefix: "/v1" });
  return app;
}

const payload = { email: "Boss@X.com", firstName: "Bo", lastName: "Ss" };
const headers = { "x-bootstrap-secret": "s" };

describe("POST /admin/bootstrap (wbmsg)", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AUTH_PROVIDER = "wbmsg";
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.upsert.mockResolvedValue({});
    tx.authAccount.findUnique.mockResolvedValue(null);
    tx.authAccount.create.mockResolvedValue({});
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({});
    app = await buildApp();
  });
  afterEach(async () => { delete process.env.AUTH_PROVIDER; await app.close(); });

  it("creates a must-set-password account with no Clerk call and no password in the response", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/bootstrap", headers, payload });
    expect(res.statusCode).toBe(201);
    const acct = tx.authAccount.create.mock.calls[0]![0].data;
    expect(acct).toMatchObject({ email: "boss@x.com", mustSetPassword: true });
    expect(acct.id).toMatch(/^usr_/);
    expect(acct.emailVerifiedAt).toBeInstanceOf(Date);
    expect(tx.user.create.mock.calls[0]![0].data).toMatchObject({ id: acct.id, role: "superAdmin" });
    expect(clerk.createClerkSuperAdmin).not.toHaveBeenCalled();
    expect(res.json().data.setPassword).toBe("forgot_password");
    expect(JSON.stringify(res.json()).toLowerCase()).not.toMatch(/"password"|temppassword/);
  });

  it.each([
    ["unverified", null],
    ["verified", new Date("2026-01-01")],
  ])("reuses a %s account: clears password, forces set-password, revokes sessions", async (_n, verifiedAt) => {
    tx.authAccount.findUnique.mockResolvedValue({ id: "usr_existing", emailVerifiedAt: verifiedAt });
    const res = await app.inject({ method: "POST", url: "/v1/admin/bootstrap", headers, payload });
    expect(res.statusCode).toBe(201);
    expect(tx.authAccount.create).not.toHaveBeenCalled();
    expect(tx.user.create.mock.calls[0]![0].data.id).toBe("usr_existing");
    const upd = tx.authAccount.update.mock.calls[0]![0];
    expect(upd.data).toMatchObject({ passwordHash: null, mustSetPassword: true, status: "active" });
    expect(upd.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(revoke.revokeAllSessions).toHaveBeenCalledWith(mockPrisma, "usr_existing", "promoted_to_super_admin");
  });

  it("returns 409 and creates nothing when a users row already exists for the account", async () => {
    tx.authAccount.findUnique.mockResolvedValue({ id: "usr_existing", emailVerifiedAt: new Date() });
    tx.user.findUnique.mockResolvedValue({ id: "usr_existing" });
    const res = await app.inject({ method: "POST", url: "/v1/admin/bootstrap", headers, payload });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
