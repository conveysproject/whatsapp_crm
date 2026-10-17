import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  issueCode: vi.fn(),
  verifyCode: vi.fn(),
  sendCodeEmail: vi.fn(),
  createSession: vi.fn(),
  trustDevice: vi.fn(),
}));
vi.mock("../limits.js", () => ({ hitLimit: m.hitLimit, authClientIp: () => "9.9.9.9" }));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: m.verifyCode }));
vi.mock("../emails.js", () => ({ sendCodeEmail: m.sendCodeEmail }));
vi.mock("../sessions.js", () => ({ createSession: m.createSession }));
vi.mock("../devices.js", () => ({ trustDevice: m.trustDevice }));

import { authRouter } from "./index.js";
import { settleSignupWork } from "./signup.js";

process.env.AUTH_PROVIDER = "wbmsg"; // the module is dark in clerk mode

const prisma = {
  authAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", prisma as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const body = { email: " Foo@X.com ", password: "correct horse", firstName: "Foo", lastName: "Bar" };

describe("auth signup", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    m.hitLimit.mockResolvedValue(false);
    m.issueCode.mockResolvedValue({ code: "123456", codeId: "c1" });
    m.sendCodeEmail.mockResolvedValue(undefined);
    prisma.authAccount.findUnique.mockResolvedValue(null);
    prisma.authAccount.create.mockImplementation(async ({ data }: any) => data);
    app = await build();
  });

  it("creates an unverified account with normalized email and argon2 hash, sends code", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    const data = prisma.authAccount.create.mock.calls[0][0].data;
    expect(data.email).toBe("foo@x.com");
    expect(data.id).toMatch(/^usr_[a-z2-7]{26}$/);
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.firstName).toBe("Foo");
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "foo@x.com" } });
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "email_verify", target: "foo@x.com", accountId: data.id });
    expect(m.sendCodeEmail).toHaveBeenCalledWith("foo@x.com", "email_verify", "123456");
  });

  it("existing verified email: identical 202, nothing created or sent", async () => {
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_x", emailVerifiedAt: new Date() });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.authAccount.update).not.toHaveBeenCalled();
    expect(m.issueCode).not.toHaveBeenCalled();
    expect(m.sendCodeEmail).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("existing unverified: re-sends a code but never overwrites password or names", async () => {
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_x", emailVerifiedAt: null });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.authAccount.update).not.toHaveBeenCalled();
    expect(m.sendCodeEmail).toHaveBeenCalledTimes(1);
  });

  it("replies 202 before any mail is sent (reply does not wait on the mailer)", async () => {
    let release!: () => void;
    m.sendCodeEmail.mockImplementation(() => new Promise<void>((r) => (release = r)));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(m.sendCodeEmail).toHaveBeenCalledTimes(1));
    release();
    await settleSignupWork();
    expect(m.sendCodeEmail).toHaveBeenCalledTimes(1);
  });

  it("mailer failure still returns 202", async () => {
    m.sendCodeEmail.mockRejectedValue(new Error("smtp down"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
  });

  it("database failure still returns 202", async () => {
    prisma.authAccount.findUnique.mockRejectedValue(new Error("db down"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
  });

  it("concurrent signups of the same new email: both 202, one account, P2002 treated as existing", async () => {
    let created: any = null;
    prisma.authAccount.findUnique.mockImplementation(async () => created);
    prisma.authAccount.create.mockImplementation(async ({ data }: any) => {
      if (created) throw Object.assign(new Error("unique"), { code: "P2002" });
      created = { ...data, emailVerifiedAt: null };
      return created;
    });
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/v1/auth/signup", payload: body }),
      app.inject({ method: "POST", url: "/v1/auth/signup", payload: body }),
    ]);
    await settleSignupWork();
    expect([a.statusCode, b.statusCode]).toEqual([202, 202]);
    expect(a.json()).toEqual(b.json());
    expect(created).not.toBeNull();
  });

  it("throttled code issue still returns 202 and sends nothing", async () => {
    m.issueCode.mockResolvedValue({ error: "throttled" });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(m.sendCodeEmail).not.toHaveBeenCalled();
  });

  it("weak password -> 400 WEAK_PASSWORD", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: { ...body, password: "short" } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." } });
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
  });

  it("strips extra properties (Fastify default ajv) and rejects empty names", async () => {
    const r1 = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: { ...body, role: "admin" } });
    expect(r1.statusCode).toBe(202);
    await settleSignupWork();
    expect(prisma.authAccount.create.mock.calls[0][0].data).not.toHaveProperty("role");
    const r2 = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: { ...body, firstName: "" } });
    expect(r2.statusCode).toBe(400);
  });

  it("over the per-IP limit -> 429 RATE_LIMITED", async () => {
    m.hitLimit.mockResolvedValue(true);
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
    await settleSignupWork();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." } });
    expect(m.hitLimit).toHaveBeenCalledWith(expect.stringMatching(/^auth:ip:/), 20, 600);
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
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
  const vbody = { email: "Foo@X.com", code: "123456", client: "mobile" };
  beforeEach(async () => {
    vi.clearAllMocks();
    m.hitLimit.mockResolvedValue(false);
    prisma.authAccount.findUnique.mockResolvedValue({ id: "usr_x", email: "foo@x.com" });
    prisma.authAccount.update.mockResolvedValue({});
    m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_x", target: "foo@x.com" });
    m.createSession.mockResolvedValue({ sessionId: "s", refreshToken: "rt", accessToken: "at", expiresAt: new Date() });
    m.trustDevice.mockResolvedValue("dev123");
    app = await build();
  });

  it("right code -> 200 with tokens, marks verified, creates user session, trusts device", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 600, deviceId: "dev123" });
    expect(m.verifyCode).toHaveBeenCalledWith(prisma, { purpose: "email_verify", target: "foo@x.com", code: "123456" });
    expect(prisma.authAccount.update.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ accountId: "usr_x", client: "mobile", typ: "user", ip: "9.9.9.9" }));
    expect(m.trustDevice).toHaveBeenCalledWith(prisma, "usr_x");
  });

  it.each(["invalid", "expired", "too_many_attempts"])("code failure (%s) -> one generic 400", async (reason) => {
    m.verifyCode.mockResolvedValue({ ok: false, reason });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." } });
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("unknown account -> same 400", async () => {
    prisma.authAccount.findUnique.mockResolvedValue(null);
    m.verifyCode.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_CODE");
  });

  it("code for a different account -> 400", async () => {
    m.verifyCode.mockResolvedValue({ ok: true, accountId: "usr_other", target: "foo@x.com" });
    const res = await app.inject({ method: "POST", url: "/v1/auth/signup/verify", payload: vbody });
    expect(res.statusCode).toBe(400);
    expect(m.createSession).not.toHaveBeenCalled();
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
