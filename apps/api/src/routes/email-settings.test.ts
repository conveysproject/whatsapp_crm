import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as BrandModule from "../lib/brand.js";
import type * as TransportModule from "../lib/email/transport.js";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

const mockCanBeParent = vi.fn();
vi.mock("../lib/parent-orgs.js", () => ({ canBeParent: (...a: unknown[]) => mockCanBeParent(...a) }));

const mockEval = vi.fn();
const mockTtl = vi.fn();
vi.mock("../lib/redis.js", () => ({
  redis: { eval: (...a: unknown[]) => mockEval(...a), ttl: (...a: unknown[]) => mockTtl(...a) },
}));

const mockResolveBrand = vi.fn();
vi.mock("../lib/brand.js", async (orig) => ({
  ...(await orig<typeof BrandModule>()),
  resolveBrand: (...a: unknown[]) => mockResolveBrand(...a),
}));

const mockSend = vi.fn();
const mockBuildTransport = vi.fn();
vi.mock("../lib/email/transport.js", async (orig) => ({
  ...(await orig<typeof TransportModule>()),
  buildTransport: (...a: unknown[]) => mockBuildTransport(...a),
}));

const mockPrisma = {
  orgEmailSettings: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
};

type Auth = {
  userId: string;
  organizationId: string;
  role: string;
  impersonation?: { adminId: string; mode: string };
};
let auth: Auth;

const SECRET_KEY = "planted-api-key-SECRET123";
const SECRET_PASS = "planted-smtp-pass-SECRET456";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = auth as never;
  });
  const { emailSettingsRoutes } = await import("./email-settings.js");
  await app.register(emailSettingsRoutes, { prefix: "/v1" });
  return app;
}

async function enc(value: unknown): Promise<string> {
  const { encryptJson } = await import("../lib/secret-box.js");
  return encryptJson(value);
}

async function storedRow(over: Record<string, unknown> = {}, cfg?: unknown) {
  return {
    id: "row-1",
    organizationId: "org-parent",
    provider: "sendgrid",
    fromAddress: "no-reply@acme.test",
    fromName: "Acme",
    replyTo: null,
    configEnc: await enc(cfg ?? { provider: "sendgrid", apiKey: SECRET_KEY, region: "eu" }),
    status: "verified",
    consecutiveFailures: 2,
    lastError: "old error",
    lastTestedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...over,
  };
}

const BASE = "/v1/organizations/email-settings";
const sgBody = { provider: "sendgrid", config: { apiKey: "test-key-12345" }, fromAddress: "no-reply@acme.test" };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  process.env["EMAIL_SETTINGS_KEY"] = TEST_KEY;
  auth = { userId: "u-admin", organizationId: "org-parent", role: "admin" };
  mockCanBeParent.mockResolvedValue(true);
  mockEval.mockResolvedValue(1);
  mockTtl.mockResolvedValue(1234);
  mockResolveBrand.mockResolvedValue({ name: "Acme Cloud", isDefault: false });
  mockBuildTransport.mockReturnValue({ send: mockSend });
  mockSend.mockResolvedValue({ ok: true });
  mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(null);
  mockPrisma.orgEmailSettings.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({
    id: "row-1",
    lastTestedAt: null,
    updatedAt: new Date(),
    ...a.create,
  }));
  mockPrisma.orgEmailSettings.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.orgEmailSettings.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.user.findUnique.mockResolvedValue({ email: "owner@acme.test" });
  app = await buildApp();
});

afterEach(async () => {
  await new Promise((r) => setImmediate(r)); // let fire-and-forget audit writes land before the next test
  await app.close();
  delete process.env["EMAIL_SETTINGS_KEY"];
});

const flush = () => new Promise((r) => setImmediate(r));

describe("access", () => {
  const calls: Array<[string, string, unknown?]> = [
    ["GET", BASE],
    ["PUT", BASE, sgBody],
    ["POST", `${BASE}/test`, {}],
    ["DELETE", BASE],
  ];

  for (const role of ["manager", "agent", "viewer"]) {
    it(`refuses a ${role}`, async () => {
      auth.role = role;
      for (const [method, url, payload] of calls) {
        const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload: payload as object } : {}) });
        expect(res.statusCode, `${method} ${url}`).toBe(403);
      }
    });
  }

  it("refuses a non-parent org admin (a client cannot read or write)", async () => {
    mockCanBeParent.mockResolvedValue(false);
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload: payload as object } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    expect(mockPrisma.orgEmailSettings.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.orgEmailSettings.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses an impersonation session on every route", async () => {
    auth.impersonation = { adminId: "sa-1", mode: "edit" };
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload: payload as object } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("uses only the org id from the session", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(null);
    await app.inject({ method: "GET", url: `${BASE}?organizationId=org-other` });
    expect(mockPrisma.orgEmailSettings.findUnique).toHaveBeenCalledWith({ where: { organizationId: "org-parent" } });
  });
});

describe("GET", () => {
  it("returns data null when nothing is stored", async () => {
    const res = await app.inject({ method: "GET", url: BASE });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });
  });

  it("returns the non-secret config only, even if the stored JSON holds extras", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(
      await storedRow(
        { provider: "smtp" },
        { provider: "smtp", host: "smtp.acme.test", port: 587, security: "starttls", user: "mailer", pass: SECRET_PASS, apiKey: SECRET_KEY, fromAddress: "x@acme.test" },
      ),
    );
    const res = await app.inject({ method: "GET", url: BASE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      provider: "smtp",
      fromAddress: "no-reply@acme.test",
      fromName: "Acme",
      replyTo: null,
      status: "verified",
      lastError: "old error",
      lastTestedAt: "2026-01-01T00:00:00.000Z",
      consecutiveFailures: 2,
      hasCredentials: true,
      config: { host: "smtp.acme.test", port: 587, security: "starttls", user: "mailer" },
    });
    for (const s of [SECRET_PASS, SECRET_KEY, "configEnc", "v1."]) expect(res.body).not.toContain(s);
  });

  it("returns mailgun domain and region, and region for other API providers", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(
      await storedRow({ provider: "mailgun" }, { provider: "mailgun", apiKey: SECRET_KEY, domain: "mg.acme.test", region: "eu" }),
    );
    let res = await app.inject({ method: "GET", url: BASE });
    expect(res.json().data.config).toEqual({ domain: "mg.acme.test", region: "eu" });
    expect(res.body).not.toContain(SECRET_KEY);

    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    res = await app.inject({ method: "GET", url: BASE });
    expect(res.json().data.config).toEqual({ region: "eu" });
    expect(res.body).not.toContain(SECRET_KEY);
  });

  it("answers 200 configReadable false when the stored config cannot be decrypted", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    process.env["EMAIL_SETTINGS_KEY"] = OTHER_KEY; // rotated key
    let res = await app.inject({ method: "GET", url: BASE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.configReadable).toBe(false);
    expect(res.json().data).not.toHaveProperty("config");
    expect(res.body).not.toContain(SECRET_KEY);

    delete process.env["EMAIL_SETTINGS_KEY"]; // key gone
    res = await app.inject({ method: "GET", url: BASE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.configReadable).toBe(false);
  });
});

describe("PUT validation", () => {
  const put = (payload: unknown) => app.inject({ method: "PUT", url: BASE, payload: payload as object });

  it("saves a valid sendgrid config, encrypted, and resets status", async () => {
    const res = await put(sgBody);
    expect(res.statusCode).toBe(200);
    const arg = mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({ organizationId: "org-parent" });
    expect(arg.create).toMatchObject({ organizationId: "org-parent", status: "unverified", consecutiveFailures: 0, lastError: null });
    expect(arg.update).toMatchObject({ status: "unverified", consecutiveFailures: 0, lastError: null });
    expect(arg.create.configEnc).toMatch(/^v1\./);
    expect(JSON.stringify(arg)).not.toContain("test-key-12345");
    expect(res.body).not.toContain("test-key-12345");
    expect(res.json().data).toMatchObject({ provider: "sendgrid", status: "unverified", hasCredentials: true });
  });

  it("names the field for each provider's validation error", async () => {
    const cases: Array<[unknown, string]> = [
      [{ ...sgBody, config: {} }, "apiKey"],
      [{ ...sgBody, config: { apiKey: "short" } }, "apiKey"],
      [{ ...sgBody, config: { apiKey: "test-key-12345", region: "xx" } }, "region"],
      [{ provider: "mailgun", config: { apiKey: "test-key-12345" }, fromAddress: "a@acme.test" }, "domain"],
      [{ provider: "mailgun", config: { apiKey: "test-key-12345", domain: "not a host" }, fromAddress: "a@acme.test" }, "domain"],
      [{ provider: "nope", config: {}, fromAddress: "a@acme.test" }, "provider"],
      [{ provider: "smtp", config: { host: "http://x", port: 587, security: "starttls", user: "u", pass: "p" }, fromAddress: "a@acme.test" }, "host"],
      [{ provider: "smtp", config: { host: "smtp.acme.test", port: 99, security: "starttls", user: "u", pass: "p" }, fromAddress: "a@acme.test" }, "port"],
      [{ provider: "smtp", config: { host: "smtp.acme.test", port: 587, security: "plain", user: "u", pass: "p" }, fromAddress: "a@acme.test" }, "allowPlain"],
      [{ provider: "smtp", config: { host: "smtp.acme.test", port: 587, security: "starttls", user: "u" }, fromAddress: "a@acme.test" }, "pass"],
      [{ ...sgBody, fromAddress: "Bob <b@x.test>" }, "fromAddress"],
      [{ ...sgBody, replyTo: "not-an-email" }, "replyTo"],
      [{ ...sgBody, fromName: "A" }, "fromName"],
      [{ ...sgBody, fromName: "x".repeat(61) }, "fromName"],
      [{ ...sgBody, fromName: "Bad <b>" }, "fromName"],
      [{ ...sgBody, fromName: "Bad\r\nBcc: x" }, "fromName"],
      [{ ...sgBody, config: "text" }, "config"],
    ];
    for (const [payload, field] of cases) {
      const res = await put(payload);
      expect(res.statusCode, field).toBe(400);
      expect(res.json().error).toMatchObject({ code: "VALIDATION_FAILED", field });
    }
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
  });

  it("refuses an SMTP IP literal that is not public", async () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1"]) {
      const res = await put({
        provider: "smtp",
        config: { host, port: 587, security: "starttls", user: "u", pass: "p" },
        fromAddress: "a@acme.test",
      });
      expect(res.statusCode, host).toBe(400);
      expect(res.json().error.field).toBe("host");
    }
  });

  it("refuses unknown top-level fields", async () => {
    const res = await put({ ...sgBody, organizationId: "org-other" });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
  });

  it("keeps the stored secret when the same provider omits it", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    const res = await put({ provider: "sendgrid", config: { region: "us" }, fromAddress: "new@acme.test" });
    expect(res.statusCode).toBe(200);
    const { decryptJson } = await import("../lib/secret-box.js");
    const saved = decryptJson<Record<string, unknown>>(mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0].update.configEnc);
    expect(saved).toMatchObject({ apiKey: SECRET_KEY, region: "us" });
    expect(res.body).not.toContain(SECRET_KEY);
    await flush();
    expect(mockPrisma.adminAuditLog.create.mock.calls[0]![0].data.metadata).toMatchObject({ credentialsReplaced: false });
  });

  it("keeps the stored SMTP password when omitted", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(
      await storedRow({ provider: "smtp" }, { provider: "smtp", host: "smtp.acme.test", port: 587, security: "starttls", user: "mailer", pass: SECRET_PASS, fromAddress: "no-reply@acme.test" }),
    );
    const res = await put({
      provider: "smtp",
      config: { host: "smtp.acme.test", port: 587, security: "starttls", user: "mailer" },
      fromAddress: "no-reply@acme.test",
    });
    expect(res.statusCode).toBe(200);
    const { decryptJson } = await import("../lib/secret-box.js");
    const saved = decryptJson<Record<string, unknown>>(mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0].update.configEnc);
    expect(saved).toMatchObject({ pass: SECRET_PASS, port: 587 });
    expect(res.body).not.toContain(SECRET_PASS);
  });

  it("requires the secret for a different provider and for a first save", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    let res = await put({ provider: "resend", config: {}, fromAddress: "a@acme.test" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.field).toBe("apiKey");

    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(null);
    res = await put({ ...sgBody, config: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.field).toBe("apiKey");
  });

  it("resets status and failures on every update", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    await put({ provider: "sendgrid", config: {}, fromAddress: "no-reply@acme.test" });
    expect(mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0].update).toMatchObject({
      status: "unverified",
      consecutiveFailures: 0,
      lastError: null,
    });
  });

  it("answers 503 without leaking the variable name when the key is missing", async () => {
    delete process.env["EMAIL_SETTINGS_KEY"];
    const res = await put(sgBody);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("EMAIL_PROVIDER_UNAVAILABLE");
    expect(res.body).not.toContain("EMAIL_SETTINGS_KEY");
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
  });

  it("audits without any secret value", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(null);
    await put({
      provider: "smtp",
      config: { host: "smtp.acme.test", port: 587, security: "starttls", user: "mailer", pass: SECRET_PASS },
      fromAddress: "no-reply@acme.test",
    });
    await put({ ...sgBody, config: { apiKey: SECRET_KEY } });
    await flush();
    const calls = mockPrisma.adminAuditLog.create.mock.calls;
    expect(calls.length).toBe(2);
    const dump = JSON.stringify(calls);
    expect(dump).not.toContain(SECRET_PASS);
    expect(dump).not.toContain(SECRET_KEY);
    expect(dump).not.toContain("configEnc");
    expect(calls[0]![0].data).toMatchObject({
      action: "email_settings.update",
      metadata: { provider: "smtp", fromAddress: "no-reply@acme.test", credentialsReplaced: true },
    });
  });
});

describe("PUT keep-secret is bound to the connection target", () => {
  const put = (payload: unknown) => app.inject({ method: "PUT", url: BASE, payload: payload as object });
  const smtpStored = { provider: "smtp", host: "smtp.gmail.com", port: 587, security: "starttls", user: "mailer", pass: SECRET_PASS, fromAddress: "no-reply@acme.test" };
  const smtpBody = (over: Record<string, unknown> = {}) => ({
    provider: "smtp",
    config: { host: "smtp.gmail.com", port: 587, security: "starttls", user: "mailer", ...over },
    fromAddress: "no-reply@acme.test",
  });
  const MSG = "Re-enter the password when the server, port, security or username changes";

  beforeEach(async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow({ provider: "smtp" }, smtpStored));
  });

  async function expectRefused(body: unknown) {
    const res = await put(body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: "VALIDATION_FAILED", field: "pass", message: MSG });
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
    await flush();
    expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled();
    expect(res.body).not.toContain(SECRET_PASS);
  }

  it("refuses a changed host with the password omitted", async () => {
    await expectRefused(smtpBody({ host: "mx.attacker.example" }));
  });
  it("refuses a changed port", async () => {
    await expectRefused(smtpBody({ port: 2525 }));
  });
  it("refuses a security downgrade to plain", async () => {
    await expectRefused(smtpBody({ security: "plain", allowPlain: true }));
  });
  it("refuses a changed user", async () => {
    await expectRefused(smtpBody({ user: "other" }));
  });
  it("refuses a changed allowPlain", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(
      await storedRow({ provider: "smtp" }, { ...smtpStored, security: "plain", allowPlain: true }),
    );
    // plain without allowPlain is a validation error on allowPlain itself, never a merge
    const res = await put(smtpBody({ security: "plain" }));
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
    // starttls with the stored plain config: security changed
    await expectRefused(smtpBody());
  });

  it("treats a case-only host change as unchanged", async () => {
    const res = await put(smtpBody({ host: "SMTP.Gmail.com" }));
    expect(res.statusCode).toBe(200);
    const { decryptJson } = await import("../lib/secret-box.js");
    const saved = decryptJson<Record<string, unknown>>(mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0].update.configEnc);
    expect(saved).toMatchObject({ host: "smtp.gmail.com", pass: SECRET_PASS });
  });

  it("treats a mapped IPv4 spelling as unchanged", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow({ provider: "smtp" }, { ...smtpStored, host: "8.8.8.8" }));
    const res = await put(smtpBody({ host: "::ffff:8.8.8.8" }));
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(SECRET_PASS);
  });

  it("merges when every connection field is identical", async () => {
    const res = await put(smtpBody());
    expect(res.statusCode).toBe(200);
  });

  it("accepts a changed host when a new password is supplied", async () => {
    const res = await put(smtpBody({ host: "smtp.other.test", pass: "new-pass-1" }));
    expect(res.statusCode).toBe(200);
    const { decryptJson } = await import("../lib/secret-box.js");
    const saved = decryptJson<Record<string, unknown>>(mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0].update.configEnc);
    expect(saved).toMatchObject({ host: "smtp.other.test", pass: "new-pass-1" });
  });

  it("keeps the Mailgun key when only the domain changes (a path segment under the fixed Mailgun host)", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(
      await storedRow({ provider: "mailgun" }, { provider: "mailgun", apiKey: SECRET_KEY, domain: "mg.acme.test", region: "us" }),
    );
    const res = await put({ provider: "mailgun", config: { domain: "mg2.acme.test", region: "eu" }, fromAddress: "a@acme.test" });
    expect(res.statusCode).toBe(200);
    const { decryptJson } = await import("../lib/secret-box.js");
    const saved = decryptJson<Record<string, unknown>>(mockPrisma.orgEmailSettings.upsert.mock.calls[0]![0].update.configEnc);
    expect(saved).toMatchObject({ apiKey: SECRET_KEY, domain: "mg2.acme.test", region: "eu" });
  });

  it("requires the secret when the stored config is unreadable, and stores nothing", async () => {
    process.env["EMAIL_SETTINGS_KEY"] = OTHER_KEY;
    const res = await put(smtpBody());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.field).toBe("pass");
    expect(mockPrisma.orgEmailSettings.upsert).not.toHaveBeenCalled();
  });

  it("marks a first save as created in the audit", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(null);
    await put(sgBody);
    await flush();
    expect(mockPrisma.adminAuditLog.create.mock.calls[0]![0].data.metadata).toMatchObject({ created: true });
  });
});

describe("POST test", () => {
  const test = (payload: unknown = {}) => app.inject({ method: "POST", url: `${BASE}/test`, payload: payload as object });

  it("sends only to the caller's own email and marks verified", async () => {
    const row = await storedRow({ replyTo: "help@acme.test", status: "unverified" });
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(row);
    const res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { status: "verified" } });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u-admin" }, select: { email: true } });
    const sent = mockSend.mock.calls[0]![0];
    expect(sent).toMatchObject({
      to: "owner@acme.test",
      from: { name: "Acme", address: "no-reply@acme.test" },
      replyTo: "help@acme.test",
    });
    expect(sent.html).toContain("This is a test email from Acme Cloud. If you can read this, your email provider is connected.");
    expect(mockBuildTransport.mock.calls[0]![0]).toMatchObject({ provider: "sendgrid", apiKey: SECRET_KEY });
    const upd = mockPrisma.orgEmailSettings.updateMany.mock.calls[0]![0];
    expect(upd.where).toEqual({ id: "row-1", organizationId: "org-parent", updatedAt: row.updatedAt });
    expect(upd.data).toMatchObject({ status: "verified", consecutiveFailures: 0, lastError: null });
    expect(upd.data.lastTestedAt).toBeInstanceOf(Date);
  });

  it("refuses a body with a recipient", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    const res = await test({ to: "victim@x.test" });
    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("accepts a request with no body at all", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    const res = await app.inject({ method: "POST", url: `${BASE}/test` });
    expect(res.statusCode).toBe(200);
  });

  it("rate limits the 6th call per organization", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    let n = 0;
    mockEval.mockImplementation(async () => ++n);
    for (let i = 0; i < 5; i++) expect((await test()).statusCode).toBe(200);
    const res = await test();
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBe("1234");
    expect(mockEval.mock.calls[0]![2]).toBe("email-settings-test:org-parent");
    expect(mockSend).toHaveBeenCalledTimes(5);
  });

  it("leaves the status unverified on a failed test and stores only the fixed reason", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    mockSend.mockResolvedValue({ ok: false, retryable: false, reason: "the provider rejected the credentials" });
    const res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { status: "unverified", ok: false, reason: "the provider rejected the credentials", retryable: false },
    });
    const upd = mockPrisma.orgEmailSettings.updateMany.mock.calls[0]![0];
    expect(upd.data).toMatchObject({ status: "unverified", lastError: "the provider rejected the credentials" });
    expect(upd.data.lastTestedAt).toBeInstanceOf(Date);
  });

  it("a failed test keeps a failing setting failing", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow({ status: "failing" }));
    mockSend.mockResolvedValue({ ok: false, retryable: true, reason: "the provider timed out" });
    const res = await test();
    expect(res.json()).toEqual({ data: { status: "failing", ok: false, reason: "the provider timed out", retryable: true } });
    const upd = mockPrisma.orgEmailSettings.updateMany.mock.calls[0]![0];
    expect(upd.data).toMatchObject({ status: "failing", lastError: "the provider timed out" });
  });

  it("a successful test of a failing setting verifies it and resets the counter", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow({ status: "failing", consecutiveFailures: 5 }));
    const res = await test();
    expect(res.json()).toEqual({ data: { status: "verified" } });
    const upd = mockPrisma.orgEmailSettings.updateMany.mock.calls[0]![0];
    expect(upd.data).toMatchObject({ status: "verified", consecutiveFailures: 0, lastError: null });
  });

  it("caps the stored reason at 120 characters", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    mockSend.mockResolvedValue({ ok: false, retryable: true, reason: "r".repeat(500) });
    const res = await test();
    expect(res.json().data.reason).toHaveLength(120);
    expect(mockPrisma.orgEmailSettings.updateMany.mock.calls[0]![0].data.lastError).toHaveLength(120);
  });

  it("discards the result when the settings changed during the test", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow({ status: "unverified" }));
    mockPrisma.orgEmailSettings.updateMany.mockResolvedValue({ count: 0 });
    const res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ok: false, reason: "settings changed during the test" });
    expect(res.json().data.status).toBe("unverified");
  });

  it("never leaks a secret from an adapter exception", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    mockSend.mockRejectedValue(new Error(`boom ${SECRET_KEY}`));
    const res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: "unverified", ok: false });
    await flush();
    const dump = JSON.stringify([res.body, mockPrisma.orgEmailSettings.updateMany.mock.calls, mockPrisma.adminAuditLog.create.mock.calls]);
    expect(dump).not.toContain(SECRET_KEY);
    expect(dump).not.toContain("boom");
  });

  it("never leaks a secret when building the transport throws", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    mockBuildTransport.mockImplementation(() => {
      throw new Error(`bad ${SECRET_KEY}`);
    });
    const res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(SECRET_KEY);
  });

  it("audits the result without secrets", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    await test();
    await flush();
    const data = mockPrisma.adminAuditLog.create.mock.calls[0]![0].data;
    expect(data.action).toBe("email_settings.test");
    expect(data.metadata).toMatchObject({ provider: "sendgrid", ok: true });
    expect(JSON.stringify(data)).not.toContain(SECRET_KEY);
  });

  it("answers 404 NOT_CONFIGURED when nothing is stored", async () => {
    const res = await test();
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_CONFIGURED");
  });

  it("answers 503 when the key is missing", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow());
    delete process.env["EMAIL_SETTINGS_KEY"];
    const res = await test();
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("EMAIL_SETTINGS_KEY");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reports unreadable stored credentials as a failed test without marking verified", async () => {
    mockPrisma.orgEmailSettings.findUnique.mockResolvedValue(await storedRow({}, undefined));
    process.env["EMAIL_SETTINGS_KEY"] = OTHER_KEY;
    const res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ok: false, status: "unverified" });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.orgEmailSettings.updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE", () => {
  it("answers 204 and audits, also when nothing exists", async () => {
    let res = await app.inject({ method: "DELETE", url: BASE });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.orgEmailSettings.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-parent" } });
    mockPrisma.orgEmailSettings.deleteMany.mockResolvedValue({ count: 0 });
    res = await app.inject({ method: "DELETE", url: BASE });
    expect(res.statusCode).toBe(204);
    await flush();
    expect(mockPrisma.adminAuditLog.create.mock.calls[0]![0].data.action).toBe("email_settings.delete");
  });
});
