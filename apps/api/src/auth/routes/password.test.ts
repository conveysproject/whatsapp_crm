import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { hashPassword, verifyPassword } from "../password.js";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  isLocked: vi.fn(),
  recordPasswordFailure: vi.fn(),
  clearPasswordFailures: vi.fn(),
  issueCode: vi.fn(),
  verifyCode: vi.fn(),
  sendCodeEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(),
  createSession: vi.fn(),
  revokeAllSessions: vi.fn(),
  trustDevice: vi.fn(),
}));
vi.mock("../limits.js", () => ({
  hitLimit: m.hitLimit,
  authClientIp: () => "9.9.9.9",
  isLocked: m.isLocked,
  recordPasswordFailure: m.recordPasswordFailure,
  clearPasswordFailures: m.clearPasswordFailures,
}));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: m.verifyCode, verifyCodeById: vi.fn() }));
vi.mock("../emails.js", () => ({
  sendCodeEmail: m.sendCodeEmail,
  sendPasswordChangedEmail: m.sendPasswordChangedEmail,
}));
vi.mock("../sessions.js", () => ({
  createSession: m.createSession,
  revokeAllSessions: m.revokeAllSessions,
  revokeSession: vi.fn(),
  rotateRefreshToken: vi.fn(),
}));
vi.mock("../devices.js", () => ({ isTrustedDevice: vi.fn(), trustDevice: m.trustDevice }));

import { authRouter } from "./index.js";
import { settleSigninWork } from "./signin.js";
import { settlePasswordWork } from "./password.js";

process.env.AUTH_PROVIDER = "wbmsg"; // the module is dark in clerk mode

const prisma = {
  authAccount: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  loginLog: { create: vi.fn() },
};

let currentSid: string | null = "s1";
async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error" } });
  app.decorate("prisma", prisma as any);
  app.decorateRequest("auth", null as any);
  app.addHook("onRequest", async (req) => {
    (req as any).auth = { userId: "usr_a", sid: currentSid };
  });
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const INVALID_CODE = { error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." } };
let oldHash: string;
const acct = (over: Record<string, unknown> = {}) => ({
  id: "usr_a",
  email: "foo@x.com",
  passwordHash: oldHash,
  emailVerifiedAt: new Date("2026-01-01"),
  status: "active",
  mustSetPassword: false,
  ...over,
});
const post = (app: FastifyInstance, url: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: `/v1/auth/password/${url}`, payload });

describe("auth password routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    oldHash = oldHash ?? (await hashPassword("old password"));
    currentSid = "s1";
    m.hitLimit.mockResolvedValue(false);
    m.isLocked.mockResolvedValue(false);
    m.issueCode.mockResolvedValue({ code: "123456", codeId: "c1" });
    m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_a", target: "foo@x.com" });
    m.sendCodeEmail.mockResolvedValue(undefined);
    m.sendPasswordChangedEmail.mockResolvedValue(undefined);
    m.revokeAllSessions.mockResolvedValue(2);
    m.createSession.mockResolvedValue({ accessToken: "AT", refreshToken: "RT" });
    m.trustDevice.mockResolvedValue("dev_new");
    prisma.authAccount.findUnique.mockResolvedValue(acct());
    prisma.authAccount.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ role: "admin", organizationId: "org1" });
    app = await build();
  });
  afterEach(async () => {
    await settleSigninWork();
    await settlePasswordWork();
    await app.close();
  });

  describe("forgot", () => {
    it("unknown email -> 202, no code, no mail", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(null);
      const res = await post(app, "forgot", { email: "nobody@x.com" });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ ok: true });
      await settlePasswordWork();
      expect(m.issueCode).not.toHaveBeenCalled();
      expect(m.sendCodeEmail).not.toHaveBeenCalled();
    });

    it("known account -> 202 and a password_reset code email", async () => {
      const res = await post(app, "forgot", { email: " Foo@X.com " });
      expect(res.statusCode).toBe(202);
      await settlePasswordWork();
      expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "foo@x.com" } });
      expect(m.issueCode).toHaveBeenCalledWith(prisma, {
        purpose: "password_reset",
        target: "foo@x.com",
        accountId: "usr_a",
      });
      expect(m.sendCodeEmail).toHaveBeenCalledWith("foo@x.com", "password_reset", "123456");
    });

    it("must_set_password account (unverified) is eligible; inactive or unverified-without-flag is not", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(acct({ emailVerifiedAt: null, mustSetPassword: true }));
      await post(app, "forgot", { email: "foo@x.com" });
      await settlePasswordWork();
      expect(m.sendCodeEmail).toHaveBeenCalledTimes(1);

      m.sendCodeEmail.mockClear();
      prisma.authAccount.findUnique.mockResolvedValue(acct({ emailVerifiedAt: null }));
      await post(app, "forgot", { email: "foo@x.com" });
      prisma.authAccount.findUnique.mockResolvedValue(acct({ status: "disabled" }));
      await post(app, "forgot", { email: "foo@x.com" });
      await settlePasswordWork();
      expect(m.sendCodeEmail).not.toHaveBeenCalled();
    });

    it("throttled -> 202 and no mail", async () => {
      m.issueCode.mockResolvedValue({ error: "rate_limited" });
      const res = await post(app, "forgot", { email: "foo@x.com" });
      expect(res.statusCode).toBe(202);
      await settlePasswordWork();
      expect(m.sendCodeEmail).not.toHaveBeenCalled();
    });

    it("lookup failure still answers 202", async () => {
      prisma.authAccount.findUnique.mockRejectedValue(new Error("db"));
      const res = await post(app, "forgot", { email: "foo@x.com" });
      expect(res.statusCode).toBe(202);
      await settlePasswordWork();
    });
  });

  describe("reset", () => {
    const body = { email: "foo@x.com", code: "123456", newPassword: "brand new pass" };

    it("valid code: sets hash, clears flag, revokes sessions, clears lockout, sends email", async () => {
      const res = await post(app, "reset", body);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(m.verifyCode).toHaveBeenCalledWith(prisma, { purpose: "password_reset", target: "foo@x.com", code: "123456" });
      const data = prisma.authAccount.update.mock.calls[0][0].data;
      expect(prisma.authAccount.update.mock.calls[0][0].where).toEqual({ id: "usr_a" });
      expect(data.mustSetPassword).toBe(false);
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
      expect((await verifyPassword("brand new pass", data.passwordHash)).ok).toBe(true);
      expect(data.emailVerifiedAt).toEqual(new Date("2026-01-01"));
      expect(m.revokeAllSessions).toHaveBeenCalledWith(prisma, "usr_a", "password_reset");
      expect(m.clearPasswordFailures).toHaveBeenCalledWith("usr_a");
      await settlePasswordWork();
      expect(m.sendPasswordChangedEmail).toHaveBeenCalledWith("foo@x.com");
      expect(m.createSession).not.toHaveBeenCalled();
    });

    it("sets emailVerifiedAt when it was missing", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(acct({ emailVerifiedAt: null, mustSetPassword: true, passwordHash: null }));
      const res = await post(app, "reset", body);
      expect(res.statusCode).toBe(200);
      const data = prisma.authAccount.update.mock.calls[0][0].data;
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(data.mustSetPassword).toBe(false);
    });

    it("reused/invalid code -> 400 INVALID_CODE, padded, nothing changed", async () => {
      m.verifyCode.mockResolvedValue({ ok: false, reason: "invalid" });
      const t = Date.now();
      const res = await post(app, "reset", body);
      expect(Date.now() - t).toBeGreaterThanOrEqual(290);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(INVALID_CODE);
      expect(prisma.authAccount.update).not.toHaveBeenCalled();
      expect(m.revokeAllSessions).not.toHaveBeenCalled();
    });

    it("unknown account with a (somehow) ok code -> same INVALID_CODE", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(null);
      const res = await post(app, "reset", body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(INVALID_CODE);
    });

    it("weak password -> 400 WEAK_PASSWORD before the code is checked", async () => {
      const res = await post(app, "reset", { ...body, newPassword: "short" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toEqual({ code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." });
      expect(m.verifyCode).not.toHaveBeenCalled();
    });

    it("forced setup on a must_set_password account works end to end and signs in with client", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(acct({ passwordHash: null, mustSetPassword: true }));
      const res = await post(app, "reset", { ...body, client: "mobile" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 600, deviceId: "dev_new" });
      expect(prisma.authAccount.update.mock.calls[0][0].data.mustSetPassword).toBe(false);
      expect(m.createSession).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ accountId: "usr_a", client: "mobile", typ: "user", ip: "9.9.9.9" }),
      );
      expect(m.trustDevice).toHaveBeenCalledWith(prisma, "usr_a");
    });

    it("revokes sessions BEFORE writing the new hash, and a revoke failure leaves the password unchanged", async () => {
      await post(app, "reset", body);
      expect(m.revokeAllSessions.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.authAccount.update.mock.invocationCallOrder[0],
      );
      vi.clearAllMocks();
      prisma.authAccount.findUnique.mockResolvedValue(acct());
      prisma.user.findUnique.mockResolvedValue(null);
      m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_a", target: "foo@x.com" });
      m.revokeAllSessions.mockRejectedValue(new Error("db"));
      const res = await post(app, "reset", body);
      expect(res.statusCode).toBe(500);
      expect(prisma.authAccount.update).not.toHaveBeenCalled();
    });

    it("disabled account -> 400 INVALID_CODE, nothing changed", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(acct({ status: "disabled" }));
      const res = await post(app, "reset", body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(INVALID_CODE);
      expect(prisma.authAccount.update).not.toHaveBeenCalled();
      expect(m.revokeAllSessions).not.toHaveBeenCalled();
    });

    it("client reset for an account with no users row -> normal user session", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await post(app, "reset", { ...body, client: "mobile" });
      expect(res.statusCode).toBe(200);
      expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ client: "mobile", typ: "user" }));
    });

    it("superAdmin with client gets an admin session", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: null });
      await post(app, "reset", { ...body, client: "web" });
      expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ client: "admin", typ: "admin" }));
    });

    it("users lookup failure with client -> 503", async () => {
      prisma.user.findUnique.mockRejectedValue(new Error("db"));
      const res = await post(app, "reset", { ...body, client: "web" });
      expect(res.statusCode).toBe(503);
      expect(m.createSession).not.toHaveBeenCalled();
    });
  });

  describe("change", () => {
    const body = { currentPassword: "old password", newPassword: "brand new pass" };

    it("success: new hash, other sessions revoked, email sent", async () => {
      const res = await post(app, "change", body);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const data = prisma.authAccount.update.mock.calls[0][0].data;
      expect((await verifyPassword("brand new pass", data.passwordHash)).ok).toBe(true);
      expect(data.mustSetPassword).toBe(false);
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
      expect(m.revokeAllSessions).toHaveBeenCalledWith(prisma, "usr_a", "password_change", "s1");
      await settlePasswordWork();
      expect(m.sendPasswordChangedEmail).toHaveBeenCalledWith("foo@x.com");
    });

    it("wrong current password -> 401 and a failure is recorded", async () => {
      const res = await post(app, "change", { ...body, currentPassword: "nope nope" });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      expect(m.recordPasswordFailure).toHaveBeenCalledWith("usr_a");
      expect(prisma.authAccount.update).not.toHaveBeenCalled();
    });

    it("locked account -> same 401, no failure counted, no change", async () => {
      m.isLocked.mockResolvedValue(true);
      const res = await post(app, "change", body);
      expect(res.statusCode).toBe(401);
      expect(m.recordPasswordFailure).not.toHaveBeenCalled();
      expect(prisma.authAccount.update).not.toHaveBeenCalled();
    });

    it("weak new password -> 400 WEAK_PASSWORD", async () => {
      const res = await post(app, "change", { ...body, newPassword: "x".repeat(129) });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("WEAK_PASSWORD");
    });

    it("must_set_password: current password may be omitted or empty", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(acct({ passwordHash: null, mustSetPassword: true }));
      const a = await post(app, "change", { newPassword: "brand new pass" });
      expect(a.statusCode).toBe(200);
      const b = await post(app, "change", { currentPassword: "", newPassword: "brand new pass" });
      expect(b.statusCode).toBe(200);
      expect(prisma.authAccount.update.mock.calls[0][0].data.mustSetPassword).toBe(false);
    });

    it("null hash and not flagged -> 401, nothing changed", async () => {
      prisma.authAccount.findUnique.mockResolvedValue(acct({ passwordHash: null, mustSetPassword: false }));
      const res = await post(app, "change", body);
      expect(res.statusCode).toBe(401);
      expect(prisma.authAccount.update).not.toHaveBeenCalled();
      expect(m.revokeAllSessions).not.toHaveBeenCalled();
    });

    it("revokes other sessions before writing the new hash", async () => {
      await post(app, "change", body);
      expect(m.revokeAllSessions.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.authAccount.update.mock.invocationCallOrder[0],
      );
    });

    it("empty current password is rejected when not flagged", async () => {
      const res = await post(app, "change", { currentPassword: "", newPassword: "brand new pass" });
      expect(res.statusCode).toBe(401);
    });

    it("no own session -> 400 NO_SESSION", async () => {
      currentSid = null;
      const res = await post(app, "change", body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("NO_SESSION");
    });
  });
});
