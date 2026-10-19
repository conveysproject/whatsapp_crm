import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const revoke = vi.hoisted(() => ({ revokeAllSessions: vi.fn().mockResolvedValue(0) }));
vi.mock("../auth/sessions.js", () => revoke);

const tx = {
  authAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
};
const mockPrisma = {
  user: { findFirst: vi.fn(), create: vi.fn() },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

const auth = { userId: "sa-1", organizationId: "platform", role: "superAdmin" as const, permissions: {}, teamId: null, teamRole: null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = auth; });
  const { superAdminsRouter } = await import("./super-admins.js");
  await app.register(superAdminsRouter, { prefix: "/v1" });
  return app;
}

const payload = { email: "New@X.com", firstName: "Nia", lastName: "Roe" };

describe("POST /admin/super-admins", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    tx.authAccount.findUnique.mockResolvedValue(null);
    tx.authAccount.create.mockResolvedValue({});
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockImplementation(async ({ data }: { data: { id: string; email: string; fullName: string } }) => ({
      id: data.id, email: data.email, fullName: data.fullName, createdAt: new Date(),
    }));
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("creates a must-set-password account and user in one transaction, with no password", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/super-admins", payload });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const acct = tx.authAccount.create.mock.calls[0]![0].data;
    expect(acct.id).toMatch(/^usr_[a-z2-7]{26}$/);
    expect(acct).toMatchObject({ email: "new@x.com", mustSetPassword: true });
    expect(acct.emailVerifiedAt).toBeInstanceOf(Date);
    expect(acct.passwordHash).toBeUndefined();
    expect(tx.user.create.mock.calls[0]![0].data).toMatchObject({ id: acct.id, role: "superAdmin", organizationId: "platform" });
    const body = res.json();
    expect(body.data.setPassword).toBe("forgot_password");
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/"password"|temppassword/);
  });

  it.each([
    ["unverified", null],
    ["verified", new Date("2026-01-01")],
  ])("reuses a %s existing account: clears password, forces set-password, revokes sessions", async (_n, verifiedAt) => {
    tx.authAccount.findUnique.mockResolvedValue({ id: "usr_existing", emailVerifiedAt: verifiedAt });
    const res = await app.inject({ method: "POST", url: "/v1/admin/super-admins", payload });
    expect(res.statusCode).toBe(201);
    expect(tx.authAccount.create).not.toHaveBeenCalled();
    expect(tx.user.create.mock.calls[0]![0].data.id).toBe("usr_existing");
    const upd = tx.authAccount.update.mock.calls[0]![0];
    expect(upd.where).toEqual({ id: "usr_existing" });
    expect(upd.data).toMatchObject({ passwordHash: null, mustSetPassword: true, status: "active" });
    if (verifiedAt) expect(upd.data.emailVerifiedAt).toBe(verifiedAt);
    else expect(upd.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(revoke.revokeAllSessions).toHaveBeenCalledWith(mockPrisma, "usr_existing", "promoted_to_super_admin");
  });

  it("normalizes the email and maps a unique violation to 409", async () => {
    tx.user.create.mockRejectedValue(Object.assign(new Error("u"), { code: "P2002" }));
    const res = await app.inject({ method: "POST", url: "/v1/admin/super-admins", payload });
    expect(tx.authAccount.findUnique.mock.calls[0]![0].where).toEqual({ email: "new@x.com" });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 when a users row already exists for the account", async () => {
    tx.authAccount.findUnique.mockResolvedValue({ id: "usr_existing", emailVerifiedAt: null });
    tx.user.findUnique.mockResolvedValue({ id: "usr_existing" });
    const res = await app.inject({ method: "POST", url: "/v1/admin/super-admins", payload });
    expect(res.statusCode).toBe(409);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.authAccount.update).not.toHaveBeenCalled();
    expect(tx.authAccount.create).not.toHaveBeenCalled();
    expect(revoke.revokeAllSessions).not.toHaveBeenCalled();
  });
});
