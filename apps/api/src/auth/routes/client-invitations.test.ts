import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type * as ParentOrgsModule from "../../lib/parent-orgs.js";
import type * as CreateWorkspaceModule from "../../lib/create-workspace.js";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  createSession: vi.fn(),
  trustDevice: vi.fn(),
  checkPlanLimit: vi.fn(),
  canBeParent: vi.fn(),
  linkChild: vi.fn(),
  createWorkspace: vi.fn(),
}));
vi.mock("../limits.js", () => ({
  hitLimit: m.hitLimit,
  authClientIp: () => "9.9.9.9",
  isLocked: vi.fn(),
  recordPasswordFailure: vi.fn(),
  clearPasswordFailures: vi.fn(),
}));
vi.mock("../sessions.js", () => ({
  createSession: m.createSession,
  revokeAllSessions: vi.fn(),
  revokeSession: vi.fn(),
  rotateRefreshToken: vi.fn(),
}));
vi.mock("../devices.js", () => ({ isTrustedDevice: vi.fn(), trustDevice: m.trustDevice }));
vi.mock("../../lib/plan-limits.js", () => ({ checkPlanLimit: m.checkPlanLimit }));
vi.mock("../../lib/parent-orgs.js", async (orig) => ({
  ...(await orig<typeof ParentOrgsModule>()),
  canBeParent: (...a: unknown[]) => m.canBeParent(...a),
  linkChild: (...a: unknown[]) => m.linkChild(...a),
}));
vi.mock("../../lib/create-workspace.js", async (orig) => ({
  ...(await orig<typeof CreateWorkspaceModule>()),
  createWorkspace: (...a: unknown[]) => m.createWorkspace(...a),
}));

import { authRouter } from "./index.js";
import { ParentLinkError } from "../../lib/parent-orgs.js";

// Everything "created" inside the transaction goes to `pending`; it only reaches `committed`
// when the callback resolves. A throw discards it (rollback).
const db = { pending: [] as string[], committed: [] as string[] };

const tx = {
  authAccount: { create: vi.fn() },
  user: { update: vi.fn() },
  clientInvitation: { updateMany: vi.fn() },
};
const prisma = {
  clientInvitation: { findUnique: vi.fn() },
  authAccount: { findUnique: vi.fn() },
  $transaction: vi.fn(),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", prisma as any);
  app.decorateRequest("auth", null as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const inv = (over: Record<string, unknown> = {}) => ({
  id: "cinv1",
  parentOrganizationId: "parent-1",
  email: "Client@X.com",
  token: "tok",
  status: "pending",
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  firstName: "Ann",
  lastName: "Lee",
  password: "correct horse battery",
  organizationName: "Ann Co",
  mobileNumber: "+911234567890",
  client: "web",
  ...over,
});
const accept = (app: FastifyInstance, payload: Record<string, unknown>, token = "tok") =>
  app.inject({ method: "POST", url: `/v1/auth/client-invitations/${token}/accept`, payload });

describe("POST /v1/auth/client-invitations/:token/accept (new account)", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env["PARENT_ORGS_ENABLED"] = "true";
    db.pending = [];
    db.committed = [];
    m.hitLimit.mockResolvedValue(false);
    m.createSession.mockResolvedValue({ accessToken: "AT", refreshToken: "RT" });
    m.trustDevice.mockResolvedValue("dev1");
    m.canBeParent.mockResolvedValue(true);
    m.linkChild.mockResolvedValue(undefined);
    m.createWorkspace.mockImplementation(async () => {
      db.pending.push("org", "user");
      return { organizationId: "child-1" };
    });
    prisma.clientInvitation.findUnique.mockResolvedValue(inv());
    prisma.authAccount.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => {
      db.pending = [];
      const out = await fn(tx);
      db.committed.push(...db.pending);
      return out;
    });
    tx.authAccount.create.mockImplementation(async () => {
      db.pending.push("account");
      return {};
    });
    tx.user.update.mockResolvedValue({});
    tx.clientInvitation.updateMany.mockImplementation(async () => {
      db.pending.push("claim");
      return { count: 1 };
    });
    app = await build();
  });
  afterEach(async () => {
    await app.close();
    delete process.env["PARENT_ORGS_ENABLED"];
  });

  it("creates account, child org, admin user, link and claim in ONE transaction, then a session", async () => {
    const res = await accept(app, body());
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
      expiresIn: 600,
      deviceId: "dev1",
      organizationId: "child-1",
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const acc = tx.authAccount.create.mock.calls[0][0].data;
    expect(acc).toMatchObject({ email: "client@x.com", firstName: "Ann", lastName: "Lee" });
    expect(acc.emailVerifiedAt).toBeInstanceOf(Date);
    expect(acc.passwordHash).toMatch(/^\$argon2/);
    expect(m.createWorkspace).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: acc.id,
        email: "client@x.com",
        fullName: "Ann Lee",
        business: expect.objectContaining({ companyName: "Ann Co" }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: acc.id }, data: { mobileNumber: "+911234567890" } });
    expect(m.linkChild).toHaveBeenCalledWith(tx, "parent-1", "child-1", acc.id);
    const claim = tx.clientInvitation.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "cinv1", status: "pending" });
    expect(claim.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(claim.data).toEqual({ status: "accepted", acceptedOrgId: "child-1" });
    expect(db.committed).toEqual(["account", "org", "user", "claim"]);
    expect(m.canBeParent).toHaveBeenCalledWith(prisma, "parent-1");
    expect(m.createSession).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ accountId: acc.id, typ: "user", client: "web" }),
    );
    expect(m.trustDevice).toHaveBeenCalledWith(prisma, acc.id);
  });

  it("skips the mobile update when no mobile number is given", async () => {
    const { mobileNumber: _m, ...rest } = body();
    expect((await accept(app, rest)).statusCode).toBe(201);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", null],
    ["accepted", inv({ status: "accepted" })],
    ["revoked", inv({ status: "revoked" })],
    ["expired", inv({ expiresAt: new Date(Date.now() - 1000) })],
  ])("rejects a %s invitation with the generic padded 400, nothing created", async (_n, row) => {
    prisma.clientInvitation.findUnique.mockResolvedValue(row);
    const t = Date.now();
    const res = await accept(app, body());
    expect(Date.now() - t).toBeGreaterThanOrEqual(280);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: "INVALID_INVITATION", message: "This invitation link is invalid or has expired." },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("parent that can no longer be a parent gives the identical generic padded 400", async () => {
    m.canBeParent.mockResolvedValue(false);
    const t = Date.now();
    const res = await accept(app, body());
    expect(Date.now() - t).toBeGreaterThanOrEqual(280);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INVITATION");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("flag off: 404 before any lookup", async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    const res = await accept(app, body());
    expect(res.statusCode).toBe(404);
    expect(prisma.clientInvitation.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("weak password: 400 WEAK_PASSWORD, nothing created", async () => {
    const res = await accept(app, body({ password: "short" }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("existing account for the invited email: 409 ACCOUNT_EXISTS, nothing created", async () => {
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_x" });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ACCOUNT_EXISTS");
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "client@x.com" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("losing a concurrent accept (claim count 0) rolls everything back, no session", async () => {
    tx.clientInvitation.updateMany.mockResolvedValue({ count: 0 });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INVITATION");
    expect(db.committed).toEqual([]);
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.trustDevice).not.toHaveBeenCalled();
  });

  it("a link failure rolls back and maps to 409 PARENT_UNAVAILABLE", async () => {
    m.linkChild.mockRejectedValue(new ParentLinkError("PARENT_NOT_ENABLED"));
    const res = await accept(app, body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PARENT_UNAVAILABLE");
    expect(db.committed).toEqual([]);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("a unique violation (account created concurrently) maps to 409 ACCOUNT_EXISTS", async () => {
    tx.authAccount.create.mockRejectedValue({ code: "P2002" });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ACCOUNT_EXISTS");
    expect(db.committed).toEqual([]);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("an org-creation failure surfaces as 500 with nothing committed and no session", async () => {
    m.createWorkspace.mockRejectedValue(new Error("db down"));
    const res = await accept(app, body());
    expect(res.statusCode).toBe(500);
    expect(db.committed).toEqual([]);
    expect(m.linkChild).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("validates the body (missing org name, long mobile, bad client, long token)", async () => {
    const { organizationName: _o, ...noOrg } = body();
    expect((await accept(app, noOrg)).statusCode).toBe(400);
    expect((await accept(app, body({ mobileNumber: "1".repeat(31) }))).statusCode).toBe(400);
    expect((await accept(app, body({ client: "tv" }))).statusCode).toBe(400);
    // Fastify's own param length cap (100) answers 404 before the schema's 200 limit.
    expect([400, 404]).toContain((await accept(app, body(), "x".repeat(201))).statusCode);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ignores a caller-supplied parent or org id: the parent always comes from the invitation", async () => {
    const res = await accept(app, body({ organizationId: "evil", parentOrganizationId: "evil" }));
    expect(res.statusCode).toBe(201);
    expect(m.linkChild).toHaveBeenCalledWith(tx, "parent-1", "child-1", expect.any(String));
  });

  it("is rate limited with the credential limiter", async () => {
    m.hitLimit.mockResolvedValue(true);
    expect((await accept(app, body())).statusCode).toBe(429);
    expect(prisma.clientInvitation.findUnique).not.toHaveBeenCalled();
  });
});
