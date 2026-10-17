import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  isLocked: vi.fn(),
  issueCode: vi.fn(),
  verifyCode: vi.fn(),
  sendCodeEmail: vi.fn(),
  createSession: vi.fn(),
  trustDevice: vi.fn(),
  savePending: vi.fn(),
  loadPending: vi.fn(),
  deletePending: vi.fn(),
  createWorkspace: vi.fn(),
}));
vi.mock("../limits.js", () => ({ hitLimit: m.hitLimit, isLocked: m.isLocked, authClientIp: () => "9.9.9.9" }));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: m.verifyCode }));
vi.mock("../emails.js", () => ({ sendCodeEmail: m.sendCodeEmail }));
vi.mock("../sessions.js", () => ({ createSession: m.createSession }));
vi.mock("../devices.js", () => ({ trustDevice: m.trustDevice }));
vi.mock("../pending-signup.js", () => ({
  savePendingSignup: m.savePending,
  loadPendingSignup: m.loadPending,
  deletePendingSignup: m.deletePending,
}));
vi.mock("../../lib/create-workspace.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createWorkspace: m.createWorkspace,
}));

import { authRouter } from "./index.js";
import { settleSignupWork } from "./signup.js";

process.env.AUTH_PROVIDER = "wbmsg"; // the module is dark in clerk mode

const tx = { authAccount: { create: vi.fn() } };
const prisma = {
  authAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  organization: { create: vi.fn() },
  $transaction: vi.fn(),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", prisma as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const business = { companyName: "Acme", companyWebsite: "https://a.co", companyLocation: "UAE", industry: "Retail", subCategory: "Shops", revenue: "1M" };
const body = { email: " Foo@X.com ", password: "correct horse", firstName: "Foo", lastName: "Bar", business };

describe("auth signup", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    m.hitLimit.mockResolvedValue(false);
    m.issueCode.mockResolvedValue({ code: "123456", codeId: "c1" });
    m.sendCodeEmail.mockResolvedValue(undefined);
    m.savePending.mockResolvedValue("created");
    prisma.authAccount.findUnique.mockResolvedValue(null);
    app = await build();
  });

  const noDbWrites = () => {
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.authAccount.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(m.createWorkspace).not.toHaveBeenCalled();
  };

  it("stores a pending registration (argon2 hash, no plaintext), writes nothing to the DB, sends code", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, signupId: expect.any(String) });
    noDbWrites();
    const [signupId, data] = m.savePending.mock.calls[0];
    expect(res.json().signupId).toBe(signupId);
    expect(signupId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(data.email).toBe("foo@x.com");
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(data)).not.toContain("correct horse");
    expect(data).toMatchObject({ firstName: "Foo", lastName: "Bar", business });
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "foo@x.com" } });
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "email_verify", target: "foo@x.com" });
    expect(m.sendCodeEmail).toHaveBeenCalledWith("foo@x.com", "email_verify", "123456");
  });

  it("two sign-ups for the same email get distinct signupIds and separate pending entries (no overwrite)", async () => {
    const a = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    const b = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: { ...body, password: "another horse" } });
    await settleSignupWork();
    expect(a.json().signupId).not.toBe(b.json().signupId);
    expect(m.savePending).toHaveBeenCalledTimes(2);
    expect(m.savePending.mock.calls[0][0]).not.toBe(m.savePending.mock.calls[1][0]);
    expect(m.savePending.mock.calls[0][1].passwordHash).not.toBe(m.savePending.mock.calls[1][1].passwordHash);
    expect(m.deletePending).not.toHaveBeenCalled();
    expect(m.sendCodeEmail).toHaveBeenCalledTimes(2);
  });

  it("existing verified email: identical 202, nothing stored, no code, no mail", async () => {
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_x", emailVerifiedAt: new Date() });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, signupId: expect.any(String) });
    noDbWrites();
    expect(m.savePending).not.toHaveBeenCalled();
    expect(m.issueCode).not.toHaveBeenCalled();
    expect(m.sendCodeEmail).not.toHaveBeenCalled();
    // Still carries a signupId (never stored) so the reply is indistinguishable.
    expect(res.json().signupId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const again = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    expect(again.json().signupId).not.toBe(res.json().signupId);
  });

  it("replies 202 before any mail is sent (reply does not wait on the mailer)", async () => {
    let release!: () => void;
    m.sendCodeEmail.mockImplementation(() => new Promise<void>((r) => (release = r)));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, signupId: expect.any(String) });
    await vi.waitFor(() => expect(m.sendCodeEmail).toHaveBeenCalledTimes(1));
    release();
    await settleSignupWork();
  });

  it("mailer failure still returns 202", async () => {
    m.sendCodeEmail.mockRejectedValue(new Error("smtp down"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, signupId: expect.any(String) });
  });

  it("database failure still returns 202", async () => {
    prisma.authAccount.findUnique.mockRejectedValue(new Error("db down"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
  });

  it("redis failure in the background work still returns 202 and sends nothing", async () => {
    m.savePending.mockRejectedValue(new Error("redis down"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, signupId: expect.any(String) });
    expect(m.sendCodeEmail).not.toHaveBeenCalled();
  });

  it("throttled code issue still returns 202 and sends nothing", async () => {
    m.issueCode.mockResolvedValue({ error: "throttled" });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, signupId: expect.any(String) });
    expect(m.sendCodeEmail).not.toHaveBeenCalled();
  });

  it("weak password -> 400 WEAK_PASSWORD before any work", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: { ...body, password: "short" } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." } });
    expect(m.savePending).not.toHaveBeenCalled();
  });

  it("requires business with companyName, industry and revenue; rejects extra properties", async () => {
    const cases = [
      { ...body, business: undefined },
      { ...body, business: { ...business, companyName: undefined } },
      { ...body, business: { ...business, industry: undefined } },
      { ...body, business: { ...business, revenue: undefined } },
      { ...body, firstName: "" },
    ];
    for (const payload of cases) {
      const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload });
      expect(res.statusCode).toBe(400);
    }
    // Extra properties (top level and inside business) are stripped by Fastify's ajv, never stored.
    const extra = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { ...body, role: "admin", business: { ...business, extra: "x" } },
    });
    expect(extra.statusCode).toBe(202);
    await settleSignupWork();
    const stored = m.savePending.mock.calls[0][1];
    expect(stored).not.toHaveProperty("role");
    expect(stored.business).not.toHaveProperty("extra");
    // Optional business fields may be omitted.
    const ok = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { ...body, business: { companyName: "Acme", industry: "Retail", revenue: "1M" } },
    });
    expect(ok.statusCode).toBe(202);
    await settleSignupWork();
  });

  it("over the per-IP limit -> 429 RATE_LIMITED", async () => {
    m.hitLimit.mockResolvedValue(true);
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." } });
    expect(m.hitLimit).toHaveBeenCalledWith(expect.stringMatching(/^auth:ip:/), 20, 600);
    expect(m.savePending).not.toHaveBeenCalled();
  });

  it("21st request from one IP is limited", async () => {
    let n = 0;
    m.hitLimit.mockImplementation(async (_k: string, max: number) => ++n > max);
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await app.inject({ method: "POST", url: "/v1/auth/signup", payload: { ...body, password: "short" } })).statusCode;
    }
    expect(last).toBe(429);
  });
});

describe("auth signup/verify", () => {
  let app: FastifyInstance;
  const vbody = { signupId: "sid1", email: "Foo@X.com", code: "123456", client: "mobile" };
  const pending = { email: "foo@x.com", passwordHash: "$argon2id$h", firstName: "Foo", lastName: "Bar", business };
  const expired = { error: { code: "INVALID_CODE", message: "Your sign-up expired. Please start again." } };
  const generic = { error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." } };
  beforeEach(async () => {
    vi.clearAllMocks();
    m.hitLimit.mockResolvedValue(false);
    prisma.authAccount.findUnique.mockResolvedValue(null);
    m.verifyCode.mockResolvedValue({ ok: true, accountId: null, target: "foo@x.com" });
    m.loadPending.mockResolvedValue(pending);
    m.deletePending.mockResolvedValue(undefined);
    tx.authAccount.create.mockImplementation(async ({ data }: any) => data);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    m.createWorkspace.mockResolvedValue({ organizationId: "org_1" });
    m.createSession.mockResolvedValue({ sessionId: "s", refreshToken: "rt", accessToken: "at", expiresAt: new Date() });
    m.trustDevice.mockResolvedValue("dev123");
    app = await build();
  });

  it("right code -> account + workspace in one transaction, tokens + organizationId", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 600, deviceId: "dev123", organizationId: "org_1" });
    expect(m.verifyCode).toHaveBeenCalledWith(prisma, { purpose: "email_verify", target: "foo@x.com", code: "123456" });
    expect(m.loadPending).toHaveBeenCalledWith("sid1");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const data = tx.authAccount.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "foo@x.com", passwordHash: "$argon2id$h", firstName: "Foo", lastName: "Bar" });
    expect(data.id).toMatch(/^usr_[a-z2-7]{26}$/);
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(m.createWorkspace).toHaveBeenCalledWith(tx, { userId: data.id, email: "foo@x.com", fullName: "Foo Bar", business });
    expect(m.deletePending).toHaveBeenCalledWith("sid1");
    expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ accountId: data.id, client: "mobile", typ: "user", ip: "9.9.9.9" }));
    expect(m.trustDevice).toHaveBeenCalledWith(prisma, data.id);
  });

  it("falls back to the email as full name when names are blank", async () => {
    m.loadPending.mockResolvedValue({ ...pending, firstName: "", lastName: "" });
    await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(m.createWorkspace.mock.calls[0][1].fullName).toBe("foo@x.com");
  });

  it.each(["invalid", "expired", "too_many_attempts"])("code failure (%s) -> one generic 400, nothing created", async (reason) => {
    m.verifyCode.mockResolvedValue({ ok: false, reason });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(generic);
    expect(m.loadPending).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("valid code but pending entry expired -> 400 'sign-up expired', nothing created", async () => {
    m.loadPending.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(expired);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("an account for the email appeared meanwhile -> pending deleted, 400, no workspace", async () => {
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_other", email: "foo@x.com" });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(generic);
    expect(m.deletePending).toHaveBeenCalledWith("sid1");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(m.createWorkspace).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("unique violation on the account email -> 400 INVALID_CODE, pending deleted, no session", async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["email"] } }));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_CODE");
    expect(m.deletePending).toHaveBeenCalledWith("sid1");
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("unique violation on another target -> 500, pending kept, no session", async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["name"] } }));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(500);
    expect(m.deletePending).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("a signupId belonging to a different email -> 400 INVALID_CODE, nothing created", async () => {
    m.loadPending.mockResolvedValue({ ...pending, email: "victim@x.com" });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(generic);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("signupId is required", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: { ...vbody, signupId: undefined } });
    expect(res.statusCode).toBe(400);
  });

  it("a workspace failure rolls back: error propagates, pending kept, no session", async () => {
    m.createWorkspace.mockRejectedValue(new Error("boom"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(500);
    expect(m.deletePending).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("two concurrent verifies with the same code: one succeeds, the other gets 400, workspace created once", async () => {
    m.verifyCode
      .mockResolvedValueOnce({ ok: true, accountId: null, target: "foo@x.com" })
      .mockResolvedValue({ ok: false, reason: "invalid" });
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody }),
      app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 400]);
    expect(m.createWorkspace).toHaveBeenCalledTimes(1);
    expect(tx.authAccount.create).toHaveBeenCalledTimes(1);
  });

  it("every 400 path takes at least ~300 ms", async () => {
    m.verifyCode.mockResolvedValue({ ok: false, reason: "invalid" });
    const t0 = Date.now();
    await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(295);
    m.verifyCode.mockResolvedValue({ ok: true, accountId: null, target: "foo@x.com" });
    m.loadPending.mockResolvedValue(null);
    const t1 = Date.now();
    await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(Date.now() - t1).toBeGreaterThanOrEqual(295);
  });

  it("client must be web or mobile", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: { ...vbody, client: "admin" } });
    expect(res.statusCode).toBe(400);
  });

  it("is rate limited per IP", async () => {
    m.hitLimit.mockResolvedValue(true);
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(429);
  });
});
