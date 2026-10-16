import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { hashPassword } from "../password.js";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  isLocked: vi.fn(),
  recordPasswordFailure: vi.fn(),
  clearPasswordFailures: vi.fn(),
  issueCode: vi.fn(),
  verifyCodeById: vi.fn(),
  sendCodeEmail: vi.fn(),
  createSession: vi.fn(),
  isTrustedDevice: vi.fn(),
  trustDevice: vi.fn(),
}));
vi.mock("../limits.js", () => ({
  hitLimit: m.hitLimit,
  authClientIp: () => "9.9.9.9",
  isLocked: m.isLocked,
  recordPasswordFailure: m.recordPasswordFailure,
  clearPasswordFailures: m.clearPasswordFailures,
}));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCodeById: m.verifyCodeById, verifyCode: vi.fn() }));
vi.mock("../emails.js", () => ({ sendCodeEmail: m.sendCodeEmail }));
vi.mock("../sessions.js", () => ({ createSession: m.createSession }));
vi.mock("../devices.js", () => ({ isTrustedDevice: m.isTrustedDevice, trustDevice: m.trustDevice }));

import { authRouter } from "./index.js";
import { settleSigninWork } from "./signin.js";

const prisma = {
  authAccount: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  loginLog: { create: vi.fn() },
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error" } });
  app.decorate("prisma", prisma as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const BAD = { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } };
let goodHash: string;
const acct = (over: Record<string, unknown> = {}) => ({
  id: "usr_a",
  email: "foo@x.com",
  passwordHash: goodHash,
  emailVerifiedAt: new Date(),
  status: "active",
  mustSetPassword: false,
  ...over,
});
const signin = (app: FastifyInstance, payload: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: "/v1/auth/signin/password",
    payload: { email: " Foo@X.com ", password: "correct horse", client: "web", ...payload },
  });

function resetMocks(): void {
  vi.clearAllMocks();
  m.hitLimit.mockResolvedValue(false);
  m.isLocked.mockResolvedValue(false);
  m.issueCode.mockResolvedValue({ code: "123456", codeId: "c1" });
  m.sendCodeEmail.mockResolvedValue(undefined);
  m.isTrustedDevice.mockResolvedValue(true);
  m.trustDevice.mockResolvedValue("dev_new");
  m.createSession.mockResolvedValue({ accessToken: "AT", refreshToken: "RT" });
  prisma.authAccount.findUnique.mockResolvedValue(acct());
  prisma.user.findUnique.mockResolvedValue({ role: "admin", organizationId: "org1" });
  prisma.loginLog.create.mockResolvedValue({});
}

describe("auth signin", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    goodHash ??= await hashPassword("correct horse");
    resetMocks();
    app = await build();
  });

  it("trusted device: tokens, session typ user, failures cleared, success logged", async () => {
    const res = await signin(app, { deviceId: "dev1" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 600 });
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "foo@x.com" } });
    expect(m.isTrustedDevice).toHaveBeenCalledWith(prisma, "usr_a", "dev1");
    expect(m.createSession).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ accountId: "usr_a", client: "web", typ: "user", ip: "9.9.9.9" }),
    );
    expect(m.clearPasswordFailures).toHaveBeenCalledWith("usr_a");
    expect(prisma.loginLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "usr_a", orgId: "org1", method: "password", success: true, ipAddress: "9.9.9.9" }),
    });
  });

  it("untrusted device: new_device challenge, code emailed, no tokens", async () => {
    m.isTrustedDevice.mockResolvedValue(false);
    const res = await signin(app);
    await settleSigninWork();
    expect(res.json()).toEqual({ next: "new_device", challengeId: "c1" });
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "new_device", target: "foo@x.com", accountId: "usr_a" });
    expect(m.sendCodeEmail).toHaveBeenCalledWith("foo@x.com", "new_device", "123456");
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("new_device code throttled: 429", async () => {
    m.isTrustedDevice.mockResolvedValue(false);
    m.issueCode.mockResolvedValue({ error: "throttled" });
    const res = await signin(app);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("unknown email, wrong password, locked, unverified: identical 401 body, each >= 300ms", async () => {
    const setups: Array<() => void> = [
      () => prisma.authAccount.findUnique.mockResolvedValue(null),
      () => undefined,
      () => m.isLocked.mockResolvedValue(true),
      () => prisma.authAccount.findUnique.mockResolvedValue(acct({ emailVerifiedAt: null })),
    ];
    for (let i = 0; i < setups.length; i++) {
      resetMocks();
      setups[i]!();
      const t0 = Date.now();
      const res = await signin(app, i === 1 ? { password: "wrong password" } : {});
      expect(Date.now() - t0).toBeGreaterThanOrEqual(295);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual(BAD);
      expect(m.createSession).not.toHaveBeenCalled();
    }
  });

  it("wrong password records a failure and logs; unknown email logs userId unknown", async () => {
    await signin(app, { password: "wrong password" });
    expect(m.recordPasswordFailure).toHaveBeenCalledWith("usr_a");
    expect(prisma.loginLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "usr_a", success: false, method: "password" }),
    });
    prisma.authAccount.findUnique.mockResolvedValue(null);
    await signin(app);
    expect(prisma.loginLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ userId: "unknown", success: false }),
    });
    expect(m.recordPasswordFailure).toHaveBeenCalledTimes(1);
  });

  it("locked account with the correct password is still 401 and no tokens", async () => {
    m.isLocked.mockResolvedValue(true);
    const res = await signin(app);
    expect(res.statusCode).toBe(401);
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.recordPasswordFailure).not.toHaveBeenCalled();
  });

  it("log write failure does not change the response", async () => {
    prisma.loginLog.create.mockRejectedValue(new Error("db"));
    const res = await signin(app, { deviceId: "dev1" });
    expect(res.statusCode).toBe(200);
  });

  it("must_set_password: set_password challenge with password_reset code, any password, no tokens", async () => {
    prisma.authAccount.findUnique.mockResolvedValue(acct({ mustSetPassword: true }));
    const res = await signin(app, { password: "totally wrong" });
    await settleSigninWork();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ next: "set_password", challengeId: "c1" });
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "password_reset", target: "foo@x.com", accountId: "usr_a" });
    expect(m.sendCodeEmail).toHaveBeenCalledWith("foo@x.com", "password_reset", "123456");
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.recordPasswordFailure).not.toHaveBeenCalled();
  });

  it("superAdmin always gets new_device even on a trusted device", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "org1" });
    const res = await signin(app, { deviceId: "dev1" });
    expect(res.json()).toEqual({ next: "new_device", challengeId: "c1" });
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("account without a users row signs in as typ user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await signin(app, { deviceId: "dev1" });
    expect(res.statusCode).toBe(200);
    expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ typ: "user" }));
  });

  it("stores a fresh hash when the stored one needs rehash", async () => {
    const { hash } = await import("@node-rs/argon2");
    const weak = await hash("correct horse", { algorithm: 2, memoryCost: 8192, timeCost: 1, parallelism: 1 });
    prisma.authAccount.findUnique.mockResolvedValue(acct({ passwordHash: weak }));
    prisma.authAccount.update.mockResolvedValue({});
    await signin(app, { deviceId: "dev1" });
    expect(prisma.authAccount.update).toHaveBeenCalledWith({
      where: { id: "usr_a" },
      data: { passwordHash: expect.stringMatching(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/) },
    });
  });
});

describe("auth signin new-device", () => {
  let app: FastifyInstance;
  const post = (payload: Record<string, unknown> = {}) =>
    app.inject({
      method: "POST",
      url: "/v1/auth/signin/new-device",
      payload: { challengeId: "c1", code: "123456", client: "web", ...payload },
    });
  beforeEach(async () => {
    resetMocks();
    m.verifyCodeById.mockResolvedValue({ ok: true, accountId: "usr_a", target: "foo@x.com" });
    app = await build();
  });

  it("valid code: tokens + deviceId, device trusted", async () => {
    const res = await post();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 600, deviceId: "dev_new" });
    expect(m.verifyCodeById).toHaveBeenCalledWith(prisma, { codeId: "c1", purpose: "new_device", code: "123456" });
    expect(m.trustDevice).toHaveBeenCalledWith(prisma, "usr_a");
  });

  it("wrong code: 400 INVALID_CODE, no session", async () => {
    m.verifyCodeById.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await post();
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." } });
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.trustDevice).not.toHaveBeenCalled();
  });

  it("superAdmin gets an admin session on client admin", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "org1" });
    await post({ client: "mobile" });
    expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ client: "admin", typ: "admin" }));
  });
});
