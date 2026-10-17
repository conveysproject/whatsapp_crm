import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  createSession: vi.fn(),
  trustDevice: vi.fn(),
  checkPlanLimit: vi.fn(),
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

import { authRouter } from "./index.js";

process.env.AUTH_PROVIDER = "wbmsg";

const tx = {
  authAccount: { create: vi.fn() },
  user: { create: vi.fn() },
  invitation: { updateMany: vi.fn() },
};
const prisma = {
  invitation: { findUnique: vi.fn() },
  authAccount: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", prisma as any);
  app.decorateRequest("auth", null as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const inv = (over: Record<string, unknown> = {}) => ({
  id: "inv1",
  organizationId: "org1",
  email: "New@X.com",
  role: "agent",
  status: "pending",
  expiresAt: new Date(Date.now() + 60_000),
  teamId: "team1",
  teamRole: "lead",
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  firstName: "Ann",
  lastName: "Lee",
  password: "correct horse battery",
  mobileNumber: "+911234567890",
  client: "web",
  ...over,
});
const accept = (app: FastifyInstance, payload: Record<string, unknown>, token = "tok") =>
  app.inject({ method: "POST", url: `/v1/auth/invitations/${token}/accept`, payload });

describe("POST /v1/auth/invitations/:token/accept", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    m.hitLimit.mockResolvedValue(false);
    m.checkPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    m.createSession.mockResolvedValue({ accessToken: "AT", refreshToken: "RT" });
    m.trustDevice.mockResolvedValue("dev1");
    prisma.invitation.findUnique.mockResolvedValue(inv());
    prisma.authAccount.findUnique.mockResolvedValue(null);
    tx.authAccount.create.mockResolvedValue({});
    tx.user.create.mockResolvedValue({});
    tx.invitation.updateMany.mockResolvedValue({ count: 1 });
    app = await build();
  });

  it("creates account, user and session in one transaction", async () => {
    const res = await accept(app, body());
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
      expiresIn: 600,
      deviceId: "dev1",
      organizationId: "org1",
    });
    const acc = tx.authAccount.create.mock.calls[0][0].data;
    expect(acc.email).toBe("new@x.com");
    expect(acc.emailVerifiedAt).toBeInstanceOf(Date);
    expect(acc.passwordHash).toMatch(/^\$argon2/);
    const usr = tx.user.create.mock.calls[0][0].data;
    expect(usr).toMatchObject({
      id: acc.id,
      organizationId: "org1",
      role: "agent",
      teamId: "team1",
      teamRole: "lead",
      fullName: "Ann Lee",
      mobileNumber: "+911234567890",
    });
    expect(tx.invitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", status: "pending" },
      data: { status: "accepted" },
    });
    expect(m.createSession).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ accountId: acc.id, typ: "user", client: "web" }),
    );
  });

  it.each([
    ["unknown", null],
    ["accepted", inv({ status: "accepted" })],
    ["expired", inv({ expiresAt: new Date(Date.now() - 1000) })],
  ])("rejects a %s invitation, padded", async (_n, row) => {
    prisma.invitation.findUnique.mockResolvedValue(row);
    const t = Date.now();
    const res = await accept(app, body());
    expect(Date.now() - t).toBeGreaterThanOrEqual(280);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INVITATION");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    const res = await accept(app, body({ password: "short" }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." });
  });

  it("409 when an account exists for the invitation email", async () => {
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_x" });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ACCOUNT_EXISTS");
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "new@x.com" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("403 SEAT_LIMIT when no seats are free", async () => {
    m.checkPlanLimit.mockResolvedValue({ allowed: false, limit: 3, current: 3 });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SEAT_LIMIT");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("409 on a unique violation", async () => {
    tx.authAccount.create.mockRejectedValue({ code: "P2002" });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ACCOUNT_EXISTS");
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("400 when a concurrent accept already claimed the invitation", async () => {
    tx.invitation.updateMany.mockResolvedValue({ count: 0 });
    const res = await accept(app, body());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INVITATION");
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("propagates a user-create failure (transaction rolls back) without a session", async () => {
    tx.user.create.mockRejectedValue(new Error("db down"));
    const res = await accept(app, body());
    expect(res.statusCode).toBe(500);
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.trustDevice).not.toHaveBeenCalled();
  });

  it("rejects a bad client", async () => {
    expect((await accept(app, body({ client: "tv" }))).statusCode).toBe(400);
  });

  it("is rate limited with the credential limiter", async () => {
    m.hitLimit.mockResolvedValue(true);
    expect((await accept(app, body())).statusCode).toBe(429);
  });
});
