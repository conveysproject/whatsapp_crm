/**
 * Abuse suite for the own-auth API: drives the REAL authRouter, auth plugin, impersonation guard,
 * codes, limits, sessions and tokens against in-memory fakes for Prisma and Redis.
 * Only mail delivery is stubbed (captured so tests can read the code that would be emailed).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT, exportPKCS8, generateKeyPair } from "jose";
import { randomUUID } from "node:crypto";

// ---------- in-memory Redis ----------
const r = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redis = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(k)) return null;
      store.set(k, String(v));
      return "OK";
    },
    setex: async (k: string, _t: number, v: unknown) => {
      store.set(k, String(v));
      return "OK";
    },
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    // Only used for the INCR+EXPIRE script in limits.ts: KEYS[1] = key.
    eval: async (_script: string, _n: number, key: string) => {
      const n = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(n));
      return n;
    },
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    del: async (...keys: string[]) => {
      let c = 0;
      for (const k of keys) if (store.delete(k)) c++;
      return c;
    },
  };
  return { store, redis };
});
vi.mock("../lib/redis.js", () => ({ redis: r.redis }));

// ---------- captured mail ----------
const mail = vi.hoisted(() => ({
  codes: [] as { to: string; purpose: string; code: string }[],
}));
vi.mock("./emails.js", () => ({
  sendCodeEmail: vi.fn(async (to: string, purpose: string, code: string) => {
    mail.codes.push({ to, purpose, code });
  }),
  sendPasswordChangedEmail: vi.fn(async () => undefined),
}));

// Workspace rows are covered by create-workspace tests; here it only needs to succeed inside the transaction.
vi.mock("../lib/create-workspace.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createWorkspace: vi.fn(async () => ({ organizationId: "org_new" })),
}));

import authPlugin from "../plugins/auth.js";
import impersonationGuardPlugin from "../lib/impersonation-guard.js";
import { authRouter } from "./routes/index.js";
import { settleSignupWork } from "./routes/signup.js";
import { settleSigninWork } from "./routes/signin.js";
import { settlePasswordWork } from "./routes/password.js";
import { hashPassword } from "./password.js";
import { createSession } from "./sessions.js";
import { resetTokenKeysForTests } from "./tokens.js";

// ---------- in-memory Prisma ----------
type Row = Record<string, any>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    const cur = row[k];
    if (v === null) return cur === null || cur === undefined;
    if (v instanceof Date) return cur instanceof Date && cur.getTime() === v.getTime();
    if (typeof v === "object") {
      return Object.entries(v as Row).every(([op, x]) => {
        if (op === "lt") return cur < x;
        if (op === "lte") return cur <= x;
        if (op === "gt") return cur > x;
        if (op === "gte") return cur >= x;
        if (op === "not") return cur !== x;
        return false;
      });
    }
    return cur === v;
  });
}
function apply(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !(v instanceof Date) && "increment" in v) row[k] = (row[k] ?? 0) + (v as Row)["increment"];
    else row[k] = v;
  }
}
function table(defaults: () => Row) {
  const rows: Row[] = [];
  return {
    rows,
    findUnique: async ({ where }: { where: Row }) => rows.find((x) => matches(x, where)) ?? null,
    findFirst: async ({ where }: { where?: Row }) => [...rows].reverse().find((x) => matches(x, where)) ?? null,
    findMany: async ({ where }: { where?: Row }) => rows.filter((x) => matches(x, where)),
    count: async ({ where }: { where?: Row }) => rows.filter((x) => matches(x, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row = { ...defaults(), ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((x) => matches(x, where));
      if (!row) throw new Error("not found");
      apply(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows.filter((x) => matches(x, where));
      hit.forEach((x) => apply(x, data));
      return { count: hit.length };
    },
  };
}

function makePrisma() {
  const p: Row = {
    authAccount: table(() => ({
      emailVerifiedAt: null,
      passwordHash: null,
      phoneE164: null,
      phoneVerifiedAt: null,
      status: "active",
      mustSetPassword: false,
      oauthLinks: [],
    })),
    authCode: table(() => ({ id: randomUUID(), attempts: 0, consumedAt: null, createdAt: new Date() })),
    authSession: table(() => ({
      previousTokenHash: null,
      rotatedAt: null,
      revokedAt: null,
      revokedReason: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    })),
    authTrustedDevice: table(() => ({ id: randomUUID() })),
    loginLog: table(() => ({})),
    user: {
      findUnique: async () => ({ role: "admin", organizationId: "org1" }),
      findFirst: async () => ({ role: "admin", organizationId: "org1", teamId: null, teamRole: null }),
      updateMany: async () => ({ count: 1 }),
    },
    organizationMember: { findFirst: async () => null },
    vendorSetting: { findUnique: async () => null },
    adminAuditLog: { create: async () => ({}) },
  };
  p.$transaction = async (fn: (tx: unknown) => unknown) => fn(p);
  return p;
}

// ---------- harness ----------
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let goodHash: string;
let db: Row;
const PASSWORD = "correct horse";

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { extractable: true });
  privateKey = pair.privateKey;
  process.env.AUTH_JWT_PRIVATE_KEY = Buffer.from(await exportPKCS8(pair.privateKey)).toString("base64");
  process.env.AUTH_JWT_KID = "k1";
  process.env.AUTH_CODE_PEPPER = "p".repeat(40);
  goodHash = await hashPassword(PASSWORD);
});

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "fatal" } });
  app.decorate("prisma", db as any);
  await app.register(authPlugin);
  await app.register(impersonationGuardPlugin);
  await app.register(authRouter, { prefix: "/v1/auth" });
  return app;
}

function seed(over: Row = {}): Row {
  const row = {
    id: "usr_known",
    email: "known@example.com",
    passwordHash: goodHash,
    emailVerifiedAt: new Date(),
    status: "active",
    mustSetPassword: false,
    phoneE164: null,
    phoneVerifiedAt: null,
    oauthLinks: [],
    ...over,
  };
  db.authAccount.rows.push(row);
  return row;
}

const post = (app: FastifyInstance, url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: `/v1/auth${url}`, payload: payload as object, headers });
const shape = (res: { statusCode: number; body: string }) => ({ status: res.statusCode, body: res.body });
const lastCode = (purpose: string) => [...mail.codes].reverse().find((c) => c.purpose === purpose)?.code;
const newSession = (accountId = "usr_known", client: "web" | "mobile" | "admin" = "web") =>
  createSession(db as any, { accountId, client, typ: client === "admin" ? "admin" : "user" });

describe("auth abuse suite", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    r.store.clear();
    mail.codes.length = 0;
    db = makePrisma();
    process.env.AUTH_PROVIDER = "wbmsg";
    resetTokenKeysForTests();
    app = await build();
  });
  afterEach(async () => {
    delete process.env.AUTH_PROVIDER;
    await app.close();
  });

  describe("user enumeration", () => {
    it("signup: known (verified and unverified) and unknown emails answer byte-identically", async () => {
      seed();
      seed({ id: "usr_unv", email: "unverified@example.com", emailVerifiedAt: null });
      const body = { password: "longenough1", firstName: "A", lastName: "B", business: { companyName: "Co", industry: "Retail", revenue: "1M" } };
      const unknown = await post(app, "/signup", { email: "nobody@example.com", ...body });
      const verified = await post(app, "/signup", { email: "known@example.com", ...body });
      const unverified = await post(app, "/signup", { email: "unverified@example.com", ...body });
      await settleSignupWork();
      expect(shape(unknown)).toEqual({ status: 202, body: '{"ok":true}' });
      expect(shape(verified)).toEqual(shape(unknown));
      expect(shape(unverified)).toEqual(shape(unknown));
    });

    it("signin/password: unknown email and wrong password answer identically and both take >= 295 ms", async () => {
      seed();
      const t0 = Date.now();
      const unknown = await post(app, "/signin/password", { email: "nobody@example.com", password: "whatever12", client: "web" });
      const dUnknown = Date.now() - t0;
      const t1 = Date.now();
      const wrong = await post(app, "/signin/password", { email: "known@example.com", password: "whatever12", client: "web" });
      const dWrong = Date.now() - t1;
      expect(unknown.statusCode).toBe(401);
      expect(shape(wrong)).toEqual(shape(unknown));
      expect(dUnknown).toBeGreaterThanOrEqual(295);
      expect(dWrong).toBeGreaterThanOrEqual(295);
    });

    it("signin/code/request: known and unknown answer identically; only the known account is mailed", async () => {
      seed();
      const unknown = await post(app, "/signin/code/request", { email: "nobody@example.com" });
      const known = await post(app, "/signin/code/request", { email: "known@example.com" });
      await settleSigninWork();
      expect(shape(unknown)).toEqual({ status: 202, body: '{"ok":true}' });
      expect(shape(known)).toEqual(shape(unknown));
      expect(mail.codes.map((c) => c.to)).toEqual(["known@example.com"]);
    });

    it("password/forgot: known and unknown answer identically; only the known account is mailed", async () => {
      seed();
      const unknown = await post(app, "/password/forgot", { email: "nobody@example.com" });
      const known = await post(app, "/password/forgot", { email: "known@example.com" });
      await settlePasswordWork();
      expect(shape(unknown)).toEqual({ status: 202, body: '{"ok":true}' });
      expect(shape(known)).toEqual(shape(unknown));
      expect(mail.codes.map((c) => c.to)).toEqual(["known@example.com"]);
    });
  });

  describe("brute force", () => {
    it("blocks the 6th password attempt, even with the correct password, with the same 401 body", async () => {
      seed();
      const attempt = (password: string) =>
        post(app, "/signin/password", { email: "known@example.com", password, client: "web" });
      const results = [];
      for (let i = 0; i < 5; i++) results.push(await attempt("wrong-password-" + i));
      expect(results.every((x) => x.statusCode === 401)).toBe(true);
      const sixth = await attempt(PASSWORD);
      expect(shape(sixth)).toEqual(shape(results[0]!));
      expect(db.authSession.rows).toHaveLength(0);
      expect(mail.codes).toHaveLength(0);
    }, 30_000);

    it("answers the 21st request from one IP with 429", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        statuses.push((await post(app, "/signin/code/request", { email: `u${i}@example.com` })).statusCode);
      }
      expect(statuses.slice(0, 20).every((s) => s === 202)).toBe(true);
      expect(statuses[20]).toBe(429);
    });

    it("ignores spoofed client-IP headers that lack the BFF secret", async () => {
      for (let i = 0; i < 21; i++) await post(app, "/signin/code/request", { email: `u${i}@example.com` });
      const spoofed = await post(
        app,
        "/signin/code/request",
        { email: "z@example.com" },
        { "x-wbmsg-bff": "x".repeat(40), "x-wbmsg-client-ip": "8.8.8.8" },
      );
      expect(spoofed.statusCode).toBe(429);
    });
  });

  describe("access tokens", () => {
    const goodToken = async () => (await newSession()).accessToken;
    const get = (token: string) =>
      app.inject({ method: "GET", url: "/v1/auth/sessions", headers: { authorization: `Bearer ${token}` } });

    it("accepts a valid token (control)", async () => {
      expect((await get(await goodToken())).statusCode).toBe(200);
    });

    it("rejects a token with one payload character changed", async () => {
      const [h, p, s] = (await goodToken()).split(".") as [string, string, string];
      const i = Math.floor(p.length / 2);
      const swapped = p.slice(0, i) + (p[i] === "A" ? "B" : "A") + p.slice(i + 1);
      const res = await get(`${h}.${swapped}.${s}`);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects alg:none", async () => {
      const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const token = `${enc({ alg: "none", typ: "JWT", kid: "k1" })}.${enc({
        sub: "usr_known", sid: "s", typ: "user", iss: "wbmsg", aud: "wbmsg-api", iat: now, exp: now + 600,
      })}.`;
      expect((await get(token)).statusCode).toBe(401);
    });

    it("rejects an expired token", async () => {
      const past = Math.floor(Date.now() / 1000) - 60;
      const token = await new SignJWT({ sid: "s", typ: "user" })
        .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
        .setSubject("usr_known").setIssuer("wbmsg").setAudience("wbmsg-api")
        .setIssuedAt(past - 600).setExpirationTime(past)
        .sign(privateKey);
      expect((await get(token)).statusCode).toBe(401);
    });

    it("rejects a token whose session was revoked", async () => {
      const s = await newSession();
      r.store.set(`auth:revoked:${s.sessionId}`, "1");
      expect((await get(s.accessToken)).statusCode).toBe(401);
    });
  });

  describe("refresh token reuse", () => {
    it("reuse after the grace period revokes the whole family and the newest tokens", async () => {
      const s = await newSession();
      const first = await post(app, "/refresh", { refreshToken: s.refreshToken });
      expect(first.statusCode).toBe(200);
      const newest = first.json();

      // Pretend the rotation happened an hour ago (grace window long over).
      db.authSession.rows[0].rotatedAt = new Date(Date.now() - 3600_000);

      const replay = await post(app, "/refresh", { refreshToken: s.refreshToken });
      expect(replay.statusCode).toBe(401);
      expect(replay.json().error.code).toBe("SESSION_EXPIRED");
      expect(db.authSession.rows[0].revokedAt).toBeInstanceOf(Date);
      expect(db.authSession.rows[0].revokedReason).toBe("reuse_detected");

      expect((await post(app, "/refresh", { refreshToken: newest.refreshToken })).statusCode).toBe(401);
      const me = await app.inject({
        method: "GET",
        url: "/v1/auth/sessions",
        headers: { authorization: `Bearer ${newest.accessToken}` },
      });
      expect(me.statusCode).toBe(401);
    });
  });

  describe("one-time codes", () => {
    it("a signup code cannot be replayed", async () => {
      await post(app, "/signup", {
        email: "new@example.com",
        password: "longenough1",
        firstName: "A",
        lastName: "B",
        business: { companyName: "Co", industry: "Retail", revenue: "1M" },
      });
      await settleSignupWork();
      const code = lastCode("email_verify")!;
      expect(code).toMatch(/^\d{6}$/);
      const verify = () => post(app, "/signup/verify", { email: "new@example.com", code, client: "web" });
      expect((await verify()).statusCode).toBe(200);
      const replay = await verify();
      expect(replay.statusCode).toBe(400);
      expect(replay.json().error.code).toBe("INVALID_CODE");
    });

    it("a password-reset code is rejected by signup/verify, signin/code/verify and new-device (cross-purpose)", async () => {
      seed();
      await post(app, "/password/forgot", { email: "known@example.com" });
      await settlePasswordWork();
      const code = lastCode("password_reset")!;
      const codeId = db.authCode.rows.find((c: Row) => c.purpose === "password_reset")!.id;

      const asSignup = await post(app, "/signup/verify", { email: "known@example.com", code, client: "web" });
      const asSignin = await post(app, "/signin/code/verify", { email: "known@example.com", code, client: "web" });
      const asDevice = await post(app, "/signin/new-device", { challengeId: codeId, code, client: "web" });
      for (const res of [asSignup, asSignin, asDevice]) {
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe("INVALID_CODE");
      }
      expect(db.authSession.rows).toHaveLength(0);

      // The code is still good for its own purpose (the failed cross-purpose tries did not consume it).
      const reset = await post(app, "/password/reset", { email: "known@example.com", code, newPassword: "brand-new-pass" });
      expect(reset.statusCode).toBe(200);
    });

    it("a sign-in code is rejected by password/reset", async () => {
      seed();
      await post(app, "/signin/code/request", { email: "known@example.com" });
      await settleSigninWork();
      const code = lastCode("signin_email")!;
      const res = await post(app, "/password/reset", { email: "known@example.com", code, newPassword: "brand-new-pass" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_CODE");
    });

    it("a code stops working after 5 wrong guesses", async () => {
      seed();
      await post(app, "/signin/code/request", { email: "known@example.com" });
      await settleSigninWork();
      const code = lastCode("signin_email")!;
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        await post(app, "/signin/code/verify", { email: "known@example.com", code: wrong, client: "web" });
      }
      const res = await post(app, "/signin/code/verify", { email: "known@example.com", code, client: "web" });
      expect(res.statusCode).toBe(400);
    }, 30_000);
  });

  describe("JWKS", () => {
    it("is public, cacheable, and exposes no private fields", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/auth/.well-known/jwks.json" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["cache-control"]).toBe("public, max-age=300");
      const { keys } = res.json();
      expect(keys.length).toBeGreaterThanOrEqual(1);
      for (const k of keys) {
        expect(Object.keys(k).sort()).toEqual(["alg", "crv", "kid", "kty", "use", "x"]);
        expect(k).not.toHaveProperty("d");
      }
      expect(res.body).not.toContain(process.env.AUTH_JWT_PRIVATE_KEY!.slice(0, 20));
    });

    it("is not subject to the credential per-IP limit", async () => {
      for (let i = 0; i < 25; i++) {
        expect((await app.inject({ method: "GET", url: "/v1/auth/.well-known/jwks.json" })).statusCode).toBe(200);
      }
    });
  });

  describe("GET /me/security", () => {
    const getSecurity = (headers: Record<string, string>) =>
      app.inject({ method: "GET", url: "/v1/auth/me/security", headers });

    it("without a token -> 401", async () => {
      expect((await getSecurity({})).statusCode).toBe(401);
    });

    it("returns only the caller's own overview, counting live sessions only", async () => {
      seed({
        phoneE164: "+15550001111",
        phoneVerifiedAt: new Date(),
        oauthLinks: [{ provider: "google", providerSub: "g-123", emailAtLink: "known@example.com" }],
      });
      seed({ id: "usr_other", email: "other@example.com" });
      const mine = await newSession();
      await newSession("usr_known", "mobile");
      await newSession("usr_other");
      const revoked = await newSession();
      db.authSession.rows.find((x: Row) => x.id === revoked.sessionId).revokedAt = new Date();
      const expired = await newSession();
      db.authSession.rows.find((x: Row) => x.id === expired.sessionId).expiresAt = new Date(Date.now() - 1000);

      const res = await getSecurity({ authorization: `Bearer ${mine.accessToken}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        email: "known@example.com",
        emailVerified: true,
        hasPassword: true,
        mustSetPassword: false,
        phone: { e164: "+15550001111", verified: true },
        oauth: [{ provider: "google" }],
        sessions: 2,
      });
      expect(res.body).not.toContain("g-123");
      expect(res.body).not.toContain("argon2");
    });

    it("phone is null and hasPassword false when absent; mustSetPassword mirrors the account", async () => {
      seed({ passwordHash: null, emailVerifiedAt: null, mustSetPassword: true });
      const s = await newSession();
      const res = await getSecurity({ authorization: `Bearer ${s.accessToken}` });
      expect(res.json()).toMatchObject({ emailVerified: false, hasPassword: false, mustSetPassword: true, phone: null, oauth: [] });
    });

    it("answers 403 IMPERSONATION_BLOCKED for a demo impersonation token", async () => {
      r.store.set("impersonate:demo-tok", JSON.stringify({ isDemo: true, organizationId: "org1" }));
      const res = await getSecurity({ "x-impersonate-token": "demo-tok" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IMPERSONATION_BLOCKED");
    });

    it("is refused while a super admin impersonates the user (GET included)", async () => {
      seed();
      const adminSession = await newSession("adm_1", "admin");
      r.store.set(
        "impersonate:tok",
        JSON.stringify({
          organizationId: "org1",
          targetUserId: "usr_known",
          issuedBy: "adm_1",
          issuedSid: adminSession.sessionId,
          mode: "edit",
        }),
      );
      for (const url of ["/v1/auth/me/security", "/v1/auth/sessions"]) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${adminSession.accessToken}`, "x-impersonate-token": "tok" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("IMPERSONATION_BLOCKED");
      }
    });
  });
});
