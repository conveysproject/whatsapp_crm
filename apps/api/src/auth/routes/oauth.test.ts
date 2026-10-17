import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash } from "node:crypto";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  isLocked: vi.fn(),
  issueCode: vi.fn(),
  verifyCodeById: vi.fn(),
  sendCodeEmail: vi.fn(),
  createSession: vi.fn(),
  trustDevice: vi.fn(),
  verifyBearer: vi.fn(),
  store: new Map<string, string>(),
  providers: {} as Record<string, unknown>,
}));
vi.mock("../limits.js", () => ({
  hitLimit: m.hitLimit,
  authClientIp: () => "9.9.9.9",
  isLocked: m.isLocked,
  recordPasswordFailure: vi.fn(),
  clearPasswordFailures: vi.fn(),
}));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: vi.fn(), verifyCodeById: m.verifyCodeById }));
vi.mock("../emails.js", () => ({ sendCodeEmail: m.sendCodeEmail }));
vi.mock("../sessions.js", () => ({ createSession: m.createSession }));
vi.mock("../devices.js", () => ({ isTrustedDevice: vi.fn(), trustDevice: m.trustDevice }));
vi.mock("../identity.js", () => ({ isWbmsgAuth: () => true, verifyBearer: m.verifyBearer }));
vi.mock("../oauth/registry.js", () => ({ getOAuthProvider: (id: string) => m.providers[id] ?? null }));
vi.mock("../../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => {
      m.store.set(k, v);
      return "OK";
    }),
    get: vi.fn(async (k: string) => m.store.get(k) ?? null),
    getdel: vi.fn(async (k: string) => {
      const v = m.store.get(k) ?? null;
      m.store.delete(k);
      return v;
    }),
    del: vi.fn(async (k: string) => (m.store.delete(k) ? 1 : 0)),
  },
}));

import { authRouter } from "./index.js";
import { maskEmail, settleOAuthWork } from "./oauth.js";

function fakeProvider(id: "google" | "facebook", label: string) {
  return {
    id,
    label,
    enabled: vi.fn(() => true),
    authorizeUrl: vi.fn(() => `https://${id}.example/auth`),
    exchange: vi.fn(),
  };
}
const google = fakeProvider("google", "Google");
const facebook = fakeProvider("facebook", "Facebook");
m.providers["google"] = google;
m.providers["facebook"] = facebook;

const prisma = {
  authAccount: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  authOAuthLink: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
  loginLog: { create: vi.fn() },
  organization: { findUnique: vi.fn() },
  $transaction: vi.fn(),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error" } });
  app.decorate("prisma", prisma as any);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

const AUTHZ = { authorization: "Bearer good" };
const acct = (over: Record<string, unknown> = {}) => ({
  id: "usr_a",
  email: "ann@x.com",
  emailVerifiedAt: new Date(),
  status: "active",
  mustSetPassword: false,
  ...over,
});
const gIdentity = (over: Record<string, unknown> = {}) => ({
  sub: "g-1",
  email: "Ann@X.com",
  emailVerified: true,
  firstName: "Ann",
  lastName: "Lee",
  ...over,
});

let app: FastifyInstance;
beforeEach(async () => {
  vi.clearAllMocks();
  m.store.clear();
  process.env["WEB_URL"] = "https://app.wbmsg.test";
  for (const p of [google, facebook]) {
    p.enabled.mockReturnValue(true);
    p.authorizeUrl.mockImplementation(() => `https://${p.id}.example/auth`);
  }
  m.hitLimit.mockResolvedValue(false);
  m.isLocked.mockResolvedValue(false);
  m.issueCode.mockResolvedValue({ code: "123456", codeId: "code1" });
  m.verifyCodeById.mockResolvedValue({ ok: true, accountId: null, target: "ann@x.com" });
  m.sendCodeEmail.mockResolvedValue(undefined);
  m.createSession.mockResolvedValue({ accessToken: "AT", refreshToken: "RT" });
  m.trustDevice.mockResolvedValue("dev1");
  m.verifyBearer.mockResolvedValue({ userId: "usr_a", sid: "s1", typ: "user" });
  prisma.authAccount.findUnique.mockResolvedValue(acct());
  prisma.authAccount.update.mockResolvedValue({});
  prisma.authAccount.create.mockResolvedValue({});
  prisma.authOAuthLink.findUnique.mockResolvedValue(null);
  prisma.authOAuthLink.create.mockResolvedValue({});
  prisma.authOAuthLink.update.mockResolvedValue({});
  prisma.authOAuthLink.deleteMany.mockResolvedValue({ count: 1 });
  prisma.user.findUnique.mockResolvedValue({ role: "admin", organizationId: "org1" });
  prisma.loginLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  app = await build();
});
afterEach(() => {
  delete process.env["WEB_URL"];
  delete process.env["AUTH_WHATSAPP_ORG_ID"];
  delete process.env["AUTH_WHATSAPP_TEMPLATE"];
});

const start = (provider: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: `/v1/auth/oauth/${provider}/start`, payload: body, headers });

async function startedState(provider = "google", body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const res = await start(provider, body, headers);
  expect(res.statusCode).toBe(200);
  return res.json().state as string;
}
const callback = (provider: string, state: string, code = "authcode") =>
  app.inject({ method: "POST", url: `/v1/auth/oauth/${provider}/callback`, payload: { code, state, client: "web" } });

describe("POST /oauth/:provider/start", () => {
  it("stores a single-use state with a PKCE verifier and returns the provider URL", async () => {
    const res = await start("google", { redirectUrl: "/inbox" });
    expect(res.statusCode).toBe(200);
    const { url, state } = res.json();
    expect(url).toBe("https://google.example/auth");
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const saved = JSON.parse(m.store.get(`auth:oauth:state:${state}`)!);
    expect(saved).toMatchObject({ provider: "google", intent: "signin", accountId: null, redirectUrl: "/inbox" });
    const arg = google.authorizeUrl.mock.calls[0]![0] as Record<string, string>;
    expect(arg.state).toBe(state);
    expect(arg.nonce).toBe(saved.nonce);
    expect(arg.codeChallenge).toBe(createHash("sha256").update(saved.codeVerifier).digest("base64url"));
    expect(arg.redirectUri).toBe("https://app.wbmsg.test/api/auth/oauth/google/callback");
  });

  it("an off-site redirect is replaced by /dashboard", async () => {
    const state = await startedState("google", { redirectUrl: "https://evil.example" });
    expect(JSON.parse(m.store.get(`auth:oauth:state:${state}`)!).redirectUrl).toBe("/dashboard");
  });

  it("404 when the provider is not configured or unknown", async () => {
    google.enabled.mockReturnValue(false);
    expect((await start("google")).statusCode).toBe(404);
    expect((await start("apple")).statusCode).toBe(400);
  });

  it("link intent needs an account session and binds the state to it", async () => {
    m.verifyBearer.mockRejectedValueOnce(new Error("no"));
    expect((await start("google", { intent: "link" })).statusCode).toBe(401);
    expect((await start("google", { intent: "link" }, { ...AUTHZ, "x-impersonate-token": "t" })).statusCode).toBe(403);
    const state = await startedState("google", { intent: "link" }, AUTHZ);
    expect(JSON.parse(m.store.get(`auth:oauth:state:${state}`)!)).toMatchObject({ intent: "link", accountId: "usr_a" });
  });

  it("super admins cannot link a provider", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "platform" });
    const res = await start("google", { intent: "link" }, AUTHZ);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("OAUTH_NOT_ALLOWED");
  });
});

describe("POST /oauth/:provider/callback", () => {
  it("unknown, replayed or cross-provider state: 400 OAUTH_STATE_INVALID, no exchange", async () => {
    expect((await callback("google", "nope")).json().error.code).toBe("OAUTH_STATE_INVALID");
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity());
    prisma.authOAuthLink.findUnique.mockResolvedValue({ id: "l1", accountId: "usr_a" });
    expect((await callback("google", state)).statusCode).toBe(200);
    expect((await callback("google", state)).statusCode).toBe(400);
    const fbState = await startedState("facebook");
    expect((await callback("google", fbState)).statusCode).toBe(400);
    expect(google.exchange).toHaveBeenCalledTimes(1);
  });

  it("passes the stored verifier and nonce to the exchange; a failed exchange is 400 OAUTH_FAILED", async () => {
    const state = await startedState("google");
    const saved = JSON.parse(m.store.get(`auth:oauth:state:${state}`)!);
    google.exchange.mockRejectedValue(new Error("bad code"));
    const res = await callback("google", state, "the-code");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "OAUTH_FAILED" }, intent: "signin" });
    expect(google.exchange).toHaveBeenCalledWith({
      code: "the-code",
      codeVerifier: saved.codeVerifier,
      nonce: saved.nonce,
      redirectUri: "https://app.wbmsg.test/api/auth/oauth/google/callback",
    });
  });

  it("known identity: signs in to the linked account (trusted device, logged, lastUsedAt)", async () => {
    const state = await startedState("google", { redirectUrl: "/inbox" });
    google.exchange.mockResolvedValue(gIdentity());
    prisma.authOAuthLink.findUnique.mockResolvedValue({ id: "l1", accountId: "usr_a" });
    const res = await callback("google", state);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      result: "session",
      accessToken: "AT",
      refreshToken: "RT",
      expiresIn: 600,
      deviceId: "dev1",
      needsWorkspace: false,
      redirectUrl: "/inbox",
    });
    expect(prisma.authOAuthLink.findUnique).toHaveBeenCalledWith({
      where: { provider_providerSub: { provider: "google", providerSub: "g-1" } },
    });
    expect(prisma.authOAuthLink.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { lastUsedAt: expect.any(Date) } });
    expect(m.createSession).toHaveBeenCalledWith(prisma, expect.objectContaining({ accountId: "usr_a", client: "web", typ: "user" }));
    expect(prisma.loginLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "usr_a", method: "oauth_google", success: true }),
    });
  });

  it.each([
    ["disabled account", () => prisma.authAccount.findUnique.mockResolvedValue(acct({ status: "disabled" })), "OAUTH_FAILED"],
    ["locked account", () => m.isLocked.mockResolvedValue(true), "OAUTH_FAILED"],
    ["super admin", () => prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "platform" }), "OAUTH_NOT_ALLOWED"],
  ])("known identity but %s: 403, no session", async (_l, arrange, code) => {
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity());
    prisma.authOAuthLink.findUnique.mockResolvedValue({ id: "l1", accountId: "usr_a" });
    arrange();
    const res = await callback("google", state);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe(code);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("Google, verified email matching an account: links, then signs in", async () => {
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity());
    const res = await callback("google", state);
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("session");
    expect(prisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "ann@x.com" } });
    expect(prisma.authOAuthLink.create).toHaveBeenCalledWith({
      data: { accountId: "usr_a", provider: "google", providerSub: "g-1", emailAtLink: "ann@x.com" },
    });
  });

  it("Google match, but the account already has another Google link: 409, no session", async () => {
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity());
    prisma.authOAuthLink.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await callback("google", state);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("OAUTH_PROVIDER_CONFLICT");
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("Google match on a super admin: no link, no session", async () => {
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity());
    prisma.user.findUnique.mockResolvedValue({ role: "superAdmin", organizationId: "platform" });
    expect((await callback("google", state)).statusCode).toBe(403);
    expect(prisma.authOAuthLink.create).not.toHaveBeenCalled();
  });

  it("Google, verified email with no account: creates a verified, password-less account; needs a workspace", async () => {
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity());
    prisma.authAccount.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id ? acct({ id: where.id }) : null,
    );
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await callback("google", state);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: "session", needsWorkspace: true });
    const created = prisma.authAccount.create.mock.calls[0]![0].data;
    expect(created).toMatchObject({ email: "ann@x.com", firstName: "Ann", lastName: "Lee", emailVerifiedAt: expect.any(Date) });
    expect(created.id).toMatch(/^usr_/);
    expect(created.passwordHash).toBeUndefined();
    expect(prisma.authOAuthLink.create).toHaveBeenCalledWith({
      data: { accountId: created.id, provider: "google", providerSub: "g-1", emailAtLink: "ann@x.com" },
    });
  });

  it("Google with an unverified email: confirm-email step, nothing linked or created", async () => {
    const state = await startedState("google");
    google.exchange.mockResolvedValue(gIdentity({ emailVerified: false }));
    const res = await callback("google", state);
    expect(res.json()).toMatchObject({ result: "confirm_email", provider: "google", email: "an***@x.com" });
    expect(prisma.authOAuthLink.create).not.toHaveBeenCalled();
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("Facebook never links on the email alone, even when it matches an account", async () => {
    const state = await startedState("facebook");
    facebook.exchange.mockResolvedValue({ sub: "fb-1", email: "ann@x.com", emailVerified: false, firstName: null, lastName: null });
    const res = await callback("facebook", state);
    const body = res.json();
    expect(body).toMatchObject({ result: "confirm_email", provider: "facebook", email: "an***@x.com" });
    expect(JSON.parse(m.store.get(`auth:oauth:pending:${body.pendingId}`)!)).toMatchObject({ provider: "facebook", sub: "fb-1", email: "ann@x.com" });
    expect(prisma.authOAuthLink.create).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("Facebook without an email: confirm-email step asks for one", async () => {
    const state = await startedState("facebook");
    facebook.exchange.mockResolvedValue({ sub: "fb-1", email: null, emailVerified: false, firstName: "Bo", lastName: null });
    expect((await callback("facebook", state)).json()).toMatchObject({ result: "confirm_email", email: null });
  });

  describe("link intent", () => {
    it("links the identity to the account that started the flow", async () => {
      const state = await startedState("facebook", { intent: "link" }, AUTHZ);
      facebook.exchange.mockResolvedValue({ sub: "fb-1", email: null, emailVerified: false, firstName: null, lastName: null });
      const res = await callback("facebook", state);
      expect(res.json()).toEqual({ result: "linked", provider: "facebook" });
      expect(prisma.authOAuthLink.create).toHaveBeenCalledWith({
        data: { accountId: "usr_a", provider: "facebook", providerSub: "fb-1", emailAtLink: null },
      });
      expect(m.createSession).not.toHaveBeenCalled();
    });

    it("identity already linked elsewhere: 409 OAUTH_ALREADY_LINKED; same account: ok", async () => {
      google.exchange.mockResolvedValue(gIdentity());
      prisma.authOAuthLink.findUnique.mockResolvedValue({ id: "l1", accountId: "usr_other" });
      const res = await callback("google", await startedState("google", { intent: "link" }, AUTHZ));
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: "OAUTH_ALREADY_LINKED" }, intent: "link" });
      prisma.authOAuthLink.findUnique.mockResolvedValue({ id: "l1", accountId: "usr_a" });
      expect((await callback("google", await startedState("google", { intent: "link" }, AUTHZ))).json().result).toBe("linked");
      expect(prisma.authOAuthLink.create).not.toHaveBeenCalled();
    });

    it("account already has this provider: 409 OAUTH_PROVIDER_CONFLICT", async () => {
      google.exchange.mockResolvedValue(gIdentity());
      prisma.authOAuthLink.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
      const res = await callback("google", await startedState("google", { intent: "link" }, AUTHZ));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("OAUTH_PROVIDER_CONFLICT");
    });
  });
});

describe("pending email confirmation", () => {
  async function pendingFrom(identity: Record<string, unknown>) {
    const state = await startedState("facebook");
    facebook.exchange.mockResolvedValue({ emailVerified: false, firstName: "Bo", lastName: "Ng", ...identity });
    return (await callback("facebook", state)).json().pendingId as string;
  }
  const send = (payload: Record<string, unknown>) => app.inject({ method: "POST", url: "/v1/auth/oauth/pending/send", payload });
  const verify = (payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/v1/auth/oauth/pending/verify", payload: { client: "web", code: "123456", ...payload } });

  it("send: 202, code to the provider's email, bound to the pending entry", async () => {
    const pendingId = await pendingFrom({ sub: "fb-1", email: "ann@x.com" });
    const res = await send({ pendingId, email: "attacker@evil.example" });
    await settleOAuthWork();
    expect(res.statusCode).toBe(202);
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "email_verify", target: "ann@x.com" });
    expect(m.sendCodeEmail).toHaveBeenCalledWith("ann@x.com", "email_verify", "123456", expect.stringContaining("Facebook"));
    expect(JSON.parse(m.store.get(`auth:oauth:pending:${pendingId}`)!)).toMatchObject({ target: "ann@x.com", codeId: "code1" });
  });

  it("send: uses the typed email when the provider gave none; rejects a missing or bad one", async () => {
    const pendingId = await pendingFrom({ sub: "fb-1", email: null });
    expect((await send({ pendingId })).json().error.code).toBe("INVALID_EMAIL");
    expect((await send({ pendingId, email: "not-an-email" })).statusCode).toBe(400);
    expect((await send({ pendingId, email: " New@X.com " })).statusCode).toBe(202);
    await settleOAuthWork();
    expect(m.issueCode).toHaveBeenCalledWith(prisma, { purpose: "email_verify", target: "new@x.com" });
  });

  it("send/verify with an unknown pending id: 400 OAUTH_EXPIRED", async () => {
    expect((await send({ pendingId: "nope" })).json().error.code).toBe("OAUTH_EXPIRED");
    expect((await verify({ pendingId: "nope" })).json().error.code).toBe("OAUTH_EXPIRED");
  });

  it("verify before any code was sent, with a wrong code, or a code for another address: 400 INVALID_CODE", async () => {
    const pendingId = await pendingFrom({ sub: "fb-1", email: "ann@x.com" });
    expect((await verify({ pendingId })).json().error.code).toBe("INVALID_CODE");
    await send({ pendingId });
    await settleOAuthWork();
    m.verifyCodeById.mockResolvedValueOnce({ ok: false, reason: "invalid" });
    expect((await verify({ pendingId })).statusCode).toBe(400);
    m.verifyCodeById.mockResolvedValueOnce({ ok: true, accountId: null, target: "other@x.com" });
    expect((await verify({ pendingId })).statusCode).toBe(400);
    expect(m.verifyCodeById).toHaveBeenCalledWith(prisma, { codeId: "code1", purpose: "email_verify", code: "123456" });
    expect(prisma.authOAuthLink.create).not.toHaveBeenCalled();
  });

  it("verify, existing account with that email: links Facebook after the code, then signs in", async () => {
    const pendingId = await pendingFrom({ sub: "fb-1", email: "ann@x.com" });
    await send({ pendingId });
    await settleOAuthWork();
    const res = await verify({ pendingId });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: "session", needsWorkspace: false });
    expect(prisma.authOAuthLink.create).toHaveBeenCalledWith({
      data: { accountId: "usr_a", provider: "facebook", providerSub: "fb-1", emailAtLink: "ann@x.com" },
    });
    expect(m.store.has(`auth:oauth:pending:${pendingId}`)).toBe(false);
  });

  it("verify, no account: creates one with the confirmed email; needs a workspace", async () => {
    const pendingId = await pendingFrom({ sub: "fb-2", email: null });
    await send({ pendingId, email: "new@x.com" });
    await settleOAuthWork();
    m.verifyCodeById.mockResolvedValue({ ok: true, accountId: null, target: "new@x.com" });
    prisma.authAccount.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id ? acct({ id: where.id, email: "new@x.com" }) : null,
    );
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await verify({ pendingId });
    expect(res.json()).toMatchObject({ result: "session", needsWorkspace: true });
    expect(prisma.authAccount.create.mock.calls[0]![0].data).toMatchObject({ email: "new@x.com", firstName: "Bo", lastName: "Ng" });
  });
});

describe("DELETE /oauth/:provider", () => {
  const unlink = (provider = "google") => app.inject({ method: "DELETE", url: `/v1/auth/oauth/${provider}`, headers: AUTHZ });
  const withMethods = (over: Record<string, unknown>) =>
    prisma.authAccount.findUnique.mockResolvedValue({
      passwordHash: null,
      mustSetPassword: false,
      phoneVerifiedAt: null,
      oauthLinks: [{ provider: "google" }],
      ...over,
    });

  it("needs an account session", async () => {
    m.verifyBearer.mockRejectedValue(new Error("no"));
    expect((await unlink()).statusCode).toBe(401);
  });

  it("refuses to remove the only way to sign in", async () => {
    withMethods({});
    const res = await unlink();
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("LAST_SIGN_IN_METHOD");
    withMethods({ passwordHash: "h", mustSetPassword: true });
    expect((await unlink()).statusCode).toBe(409);
    expect(prisma.authOAuthLink.deleteMany).not.toHaveBeenCalled();
  });

  it("removes the link when a password or another provider remains", async () => {
    withMethods({ passwordHash: "h" });
    expect((await unlink()).statusCode).toBe(200);
    expect(prisma.authOAuthLink.deleteMany).toHaveBeenCalledWith({ where: { accountId: "usr_a", provider: "google" } });
    withMethods({ oauthLinks: [{ provider: "google" }, { provider: "facebook" }] });
    expect((await unlink()).statusCode).toBe(200);
  });

  it("a verified WhatsApp number counts only while WhatsApp sign-in is on", async () => {
    withMethods({ phoneVerifiedAt: new Date() });
    expect((await unlink()).statusCode).toBe(409);
    process.env["AUTH_WHATSAPP_ORG_ID"] = "org";
    process.env["AUTH_WHATSAPP_TEMPLATE"] = "tpl";
    expect((await unlink()).statusCode).toBe(200);
  });

  it("404 when that provider is not linked", async () => {
    withMethods({ passwordHash: "h", oauthLinks: [] });
    expect((await unlink()).statusCode).toBe(404);
  });
});

describe("GET /methods", () => {
  it("reports which optional methods are on", async () => {
    facebook.enabled.mockReturnValue(false);
    expect((await app.inject({ method: "GET", url: "/v1/auth/methods" })).json()).toEqual({
      whatsapp: false,
      google: true,
      facebook: false,
    });
    process.env["AUTH_WHATSAPP_ORG_ID"] = "org";
    process.env["AUTH_WHATSAPP_TEMPLATE"] = "tpl";
    expect((await app.inject({ method: "GET", url: "/v1/auth/methods" })).json().whatsapp).toBe(true);
  });
});

describe("maskEmail", () => {
  it("keeps two characters and the domain", () => {
    expect(maskEmail("pooyan@gmail.com")).toBe("po***@gmail.com");
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });
});
