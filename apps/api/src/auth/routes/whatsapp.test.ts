import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type * as WaCodes from "../whatsapp-codes.js";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  isLocked: vi.fn(),
  issueCode: vi.fn(),
  verifyCode: vi.fn(),
  sendWhatsappCode: vi.fn(),
  createSession: vi.fn(),
  trustDevice: vi.fn(),
  verifyBearer: vi.fn(),
  verifyTurnstile: vi.fn(),
}));
vi.mock("../limits.js", () => ({
  hitLimit: m.hitLimit,
  authClientIp: () => "9.9.9.9",
  isLocked: m.isLocked,
  recordPasswordFailure: vi.fn(),
  clearPasswordFailures: vi.fn(),
}));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: m.verifyCode, verifyCodeById: vi.fn() }));
vi.mock("../whatsapp-codes.js", async (orig) => ({
  ...(await orig<typeof WaCodes>()),
  sendWhatsappCode: m.sendWhatsappCode,
}));
vi.mock("../sessions.js", () => ({ createSession: m.createSession }));
vi.mock("../devices.js", () => ({ isTrustedDevice: vi.fn(), trustDevice: m.trustDevice }));
vi.mock("../turnstile.js", () => ({ verifyTurnstile: m.verifyTurnstile, BOT_CHECK_FAILED: { error: { code: "BOT_CHECK_FAILED" } } }));
vi.mock("../identity.js", () => ({ verifyBearer: m.verifyBearer }));

import { authRouter } from "./index.js";
import { settleWhatsappWork } from "./whatsapp.js";

const prisma = {
  authAccount: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  loginLog: { create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error" } });
  app.decorate("prisma", prisma as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const PHONE = "+918779506101";
const acct = (over: Record<string, unknown> = {}) => ({
  id: "usr_a",
  email: "a@x.com",
  emailVerifiedAt: new Date(),
  phoneE164: PHONE,
  phoneVerifiedAt: new Date(),
  status: "active",
  mustSetPassword: false,
  ...over,
});
const AUTHZ = { authorization: "Bearer good" };

let app: FastifyInstance;
beforeEach(async () => {
  vi.clearAllMocks();
  process.env["AUTH_WHATSAPP_ORG_ID"] = "org_conveys";
  process.env["AUTH_WHATSAPP_TEMPLATE"] = "wbmsg_login_code";
  m.hitLimit.mockResolvedValue(false);
  m.isLocked.mockResolvedValue(false);
  m.verifyTurnstile.mockResolvedValue(true);
  m.issueCode.mockResolvedValue({ code: "123456", codeId: "c1" });
  m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_a", target: PHONE });
  m.sendWhatsappCode.mockResolvedValue(undefined);
  m.createSession.mockResolvedValue({ accessToken: "AT", refreshToken: "RT" });
  m.trustDevice.mockResolvedValue("dev1");
  m.verifyBearer.mockResolvedValue({ userId: "usr_a", sid: "s1", typ: "user" });
  prisma.authAccount.findUnique.mockResolvedValue(acct());
  prisma.authAccount.update.mockResolvedValue({});
  prisma.authAccount.updateMany.mockResolvedValue({ count: 0 });
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  prisma.user.findUnique.mockResolvedValue({ role: "admin", organizationId: "org1" });
  prisma.loginLog.create.mockResolvedValue({});
  app = await build();
});
afterEach(() => {
  delete process.env["AUTH_WHATSAPP_ORG_ID"];
  delete process.env["AUTH_WHATSAPP_TEMPLATE"];
});

const request = (phone = "+91 87795 06101") =>
  app.inject({ method: "POST", url: "/v1/auth/signin/whatsapp/request", payload: { phone } });
const verify = (payload: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: "/v1/auth/signin/whatsapp/verify",
    payload: { phone: "918779506101", code: "123456", client: "web", ...payload },
  });

describe("WhatsApp sign-in: feature flag", () => {
  it("every WhatsApp route 404s when the env vars are unset", async () => {
    delete process.env["AUTH_WHATSAPP_TEMPLATE"];
    expect((await request()).statusCode).toBe(404);
    expect((await verify()).statusCode).toBe(404);
    const r = await app.inject({ method: "POST", url: "/v1/auth/phone/verify/request", headers: AUTHZ, payload: { phone: PHONE } });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("FEATURE_DISABLED");
    expect(m.sendWhatsappCode).not.toHaveBeenCalled();
  });
});

describe("POST /signin/whatsapp/request", () => {
  it("202 then sends a signin_whatsapp code to the verified number", async () => {
    const res = await request();
    await settleWhatsappWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { phoneE164: PHONE } });
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "signin_whatsapp", target: PHONE, accountId: "usr_a" });
    expect(m.sendWhatsappCode).toHaveBeenCalledWith(prisma, PHONE, "123456");
  });

  it.each([
    ["no account", null],
    ["unverified number", acct({ phoneVerifiedAt: null })],
    ["disabled account", acct({ status: "disabled" })],
  ])("%s: same 202, nothing sent", async (_label, account) => {
    prisma.authAccount.findUnique.mockResolvedValue(account);
    const res = await request();
    await settleWhatsappWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(m.issueCode).not.toHaveBeenCalled();
    expect(m.sendWhatsappCode).not.toHaveBeenCalled();
  });

  it("locked accounts and super admins get nothing", async () => {
    m.isLocked.mockResolvedValueOnce(true);
    await request();
    prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "platform" });
    await request();
    await settleWhatsappWork();
    expect(m.sendWhatsappCode).not.toHaveBeenCalled();
  });

  it("global daily cap reached: still 202, the code is silently skipped", async () => {
    m.hitLimit.mockImplementation(async (key: string) => key.startsWith("auth:wa:daily:"));
    const res = await request();
    await settleWhatsappWork();
    expect(res.statusCode).toBe(202);
    expect(m.issueCode).not.toHaveBeenCalled();
    expect(m.sendWhatsappCode).not.toHaveBeenCalled();
  });

  it("unknown numbers do not use up the daily cap", async () => {
    prisma.authAccount.findUnique.mockResolvedValue(null);
    await request();
    await settleWhatsappWork();
    const keys = m.hitLimit.mock.calls.map((c) => c[0] as string);
    expect(keys.some((k) => k.startsWith("auth:wa:daily:"))).toBe(false);
  });

  it("a WhatsApp send failure still answers 202 (no enumeration)", async () => {
    m.sendWhatsappCode.mockRejectedValue(new Error("WA template send failed"));
    const res = await request();
    await settleWhatsappWork();
    expect(res.statusCode).toBe(202);
  });

  it("rejects a malformed number and a failed bot check before any lookup", async () => {
    expect((await request("12")).statusCode).toBe(400);
    expect((await request("hello world")).json().error.code).toBe("INVALID_PHONE");
    m.verifyTurnstile.mockResolvedValue(false);
    expect((await request()).statusCode).toBe(400);
    expect(prisma.authAccount.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /signin/whatsapp/verify", () => {
  it("valid code: session tokens + deviceId, logged as whatsapp_code", async () => {
    const res = await verify();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 600, deviceId: "dev1" });
    expect(m.verifyCode).toHaveBeenCalledWith(prisma, { purpose: "signin_whatsapp", target: PHONE, code: "123456" });
    expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ accountId: "usr_a", client: "web", typ: "user" }));
    expect(prisma.loginLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "usr_a", method: "whatsapp_code", success: true }),
    });
  });

  it("passes mustSetPassword through", async () => {
    prisma.authAccount.findUnique.mockResolvedValue(acct({ mustSetPassword: true }));
    expect((await verify()).json().mustSetPassword).toBe(true);
  });

  it.each([
    ["bad code", () => m.verifyCode.mockResolvedValue({ ok: false, reason: "invalid" })],
    ["code issued to another account", () => m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_b", target: PHONE })],
    ["number no longer verified", () => prisma.authAccount.findUnique.mockResolvedValue(acct({ phoneVerifiedAt: null }))],
    ["no account", () => prisma.authAccount.findUnique.mockResolvedValue(null)],
    ["super admin", () => prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "platform" })],
  ])("%s: 400 INVALID_CODE, no session", async (_label, arrange) => {
    arrange();
    const res = await verify();
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_CODE");
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("locked account: 401 even with a good code", async () => {
    m.isLocked.mockResolvedValue(true);
    const res = await verify();
    expect(res.statusCode).toBe(401);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("users lookup failure: 503", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db"));
    expect((await verify()).statusCode).toBe(503);
  });
});

describe("phone verification (Settings → Security)", () => {
  const req = (payload: Record<string, unknown>, headers: Record<string, string> = AUTHZ) =>
    app.inject({ method: "POST", url: "/v1/auth/phone/verify/request", headers, payload });
  const confirm = (payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/v1/auth/phone/verify/confirm", headers: AUTHZ, payload });

  it("needs an account session", async () => {
    m.verifyBearer.mockRejectedValue(new Error("bad"));
    expect((await req({ phone: PHONE })).statusCode).toBe(401);
    expect((await req({ phone: PHONE }, { ...AUTHZ, "x-impersonate-token": "t" })).statusCode).toBe(403);
  });

  it("request: normalizes to E.164, issues a phone_verify code for this account and sends it", async () => {
    const res = await req({ phone: "+91 87795-06101" });
    expect(res.statusCode).toBe(200);
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "phone_verify", target: PHONE, accountId: "usr_a" });
    expect(m.sendWhatsappCode).toHaveBeenCalledWith(prisma, PHONE, "123456");
    expect(m.hitLimit).toHaveBeenCalledWith("auth:phonev:acct:usr_a", 5, 3600);
  });

  it("request: invalid number 400, over limit 429, throttled 429, send failure 502", async () => {
    expect((await req({ phone: "123" })).statusCode).toBe(400);
    m.hitLimit.mockResolvedValueOnce(true);
    expect((await req({ phone: PHONE })).statusCode).toBe(429);
    m.issueCode.mockResolvedValueOnce({ error: "throttled" });
    expect((await req({ phone: PHONE })).statusCode).toBe(429);
    m.sendWhatsappCode.mockRejectedValueOnce(new Error("WA"));
    const res = await req({ phone: PHONE });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("WHATSAPP_SEND_FAILED");
  });

  it("confirm: stores the verified number on the caller's account only", async () => {
    const res = await confirm({ phone: PHONE, code: "123456" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ phone: { e164: PHONE, verified: true } });
    expect(m.verifyCode).toHaveBeenCalledWith(prisma, { purpose: "phone_verify", target: PHONE, code: "123456" });
    expect(prisma.authAccount.updateMany).toHaveBeenCalledWith({
      where: { phoneE164: PHONE, phoneVerifiedAt: null, NOT: { id: "usr_a" } },
      data: { phoneE164: null },
    });
    expect(prisma.authAccount.update).toHaveBeenCalledWith({
      where: { id: "usr_a" },
      data: { phoneE164: PHONE, phoneVerifiedAt: expect.any(Date) },
    });
  });

  it("confirm: a code issued to another account is rejected", async () => {
    m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_b", target: PHONE });
    expect((await confirm({ phone: PHONE, code: "123456" })).statusCode).toBe(400);
    expect(prisma.authAccount.update).not.toHaveBeenCalled();
  });

  it("confirm: number verified on another account → 409 PHONE_IN_USE", async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await confirm({ phone: PHONE, code: "123456" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PHONE_IN_USE");
  });

  const methods = (over: Record<string, unknown>) =>
    prisma.authAccount.findUnique.mockResolvedValue({
      passwordHash: null,
      mustSetPassword: false,
      phoneVerifiedAt: new Date(),
      oauthLinks: [],
      ...over,
    });
  const delPhone = () => app.inject({ method: "DELETE", url: "/v1/auth/phone", headers: AUTHZ });

  it("DELETE /phone clears the caller's number under a row lock when another method remains", async () => {
    methods({ passwordHash: "h" });
    const res = await delPhone();
    expect(res.statusCode).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.authAccount.update).toHaveBeenCalledWith({
      where: { id: "usr_a" },
      data: { phoneE164: null, phoneVerifiedAt: null },
    });
    methods({ oauthLinks: [{ provider: "google" }] });
    expect((await delPhone()).statusCode).toBe(200);
  });

  it("DELETE /phone refuses removing the last non-email method", async () => {
    methods({});
    const res = await delPhone();
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("LAST_SIGN_IN_METHOD");
    methods({ passwordHash: "h", mustSetPassword: true });
    expect((await delPhone()).statusCode).toBe(409);
    expect(prisma.authAccount.update).not.toHaveBeenCalled();
  });

  it("DELETE /phone on an unverified number is always allowed", async () => {
    methods({ phoneVerifiedAt: null });
    expect((await delPhone()).statusCode).toBe(200);
  });

  it("DELETE /phone is behind the WhatsApp feature flag", async () => {
    delete process.env["AUTH_WHATSAPP_TEMPLATE"];
    expect((await delPhone()).statusCode).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("request: Turnstile is enforced", async () => {
    m.verifyTurnstile.mockResolvedValue(false);
    const res = await req({ phone: PHONE, turnstileToken: "t" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BOT_CHECK_FAILED");
    expect(m.issueCode).not.toHaveBeenCalled();
  });

  it("request: global daily cap reached gives 429, nothing sent", async () => {
    m.hitLimit.mockImplementation(async (key: string) => key.startsWith("auth:wa:daily:"));
    const res = await req({ phone: PHONE });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "Please try again later." } });
    expect(m.issueCode).not.toHaveBeenCalled();
    expect(m.sendWhatsappCode).not.toHaveBeenCalled();
  });
});
