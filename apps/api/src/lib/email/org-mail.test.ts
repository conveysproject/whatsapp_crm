import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type * as TransportModule from "./transport.js";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const SECRET = "planted-api-key-SECRET123";

const mockSendMail = vi.fn();
vi.mock("../mail.js", () => ({ sendMail: (...a: unknown[]) => mockSendMail(...a) }));

const mockEval = vi.fn();
vi.mock("../redis.js", () => ({ redis: { eval: (...a: unknown[]) => mockEval(...a) } }));

const mockProviderSend = vi.fn();
const mockBuildTransport = vi.fn();
vi.mock("./transport.js", async (orig) => ({
  ...(await orig<typeof TransportModule>()),
  buildTransport: (...a: unknown[]) => mockBuildTransport(...a),
}));

import { countsTowardFailing, sendOrgMail } from "./org-mail.js";
import { encryptJson } from "../secret-box.js";

const prisma = {
  organization: { findUnique: vi.fn() },
  orgEmailSettings: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { findMany: vi.fn() },
};
const db = prisma as unknown as PrismaClient;
const logger = { warn: vi.fn() };

const UPDATED_AT = new Date("2026-01-02T00:00:00Z");

function settings(over: Record<string, unknown> = {}) {
  return {
    id: "set-1",
    organizationId: "parent-1",
    provider: "sendgrid",
    fromAddress: "no-reply@acme.test",
    fromName: "Acme",
    replyTo: "help@acme.test",
    configEnc: encryptJson({ provider: "sendgrid", apiKey: SECRET }),
    status: "verified",
    consecutiveFailures: 0,
    updatedAt: UPDATED_AT,
    ...over,
  };
}
const parentOrg = { isParent: true, whiteLabelEnabled: true, parentOrganizationId: null, parentOrganization: null };
const clientOrg = (parent: Record<string, unknown> | null = { isParent: true, whiteLabelEnabled: true }) => ({
  isParent: false,
  whiteLabelEnabled: false,
  parentOrganizationId: "parent-1",
  parentOrganization: parent,
});

const args = { to: "u@x.test", subject: "Subj", html: "<p>hi</p>" };
const brand = { name: "Acme Msgs", logoUrl: null, supportEmail: "brand@acme.test", hidePoweredBy: false };

beforeEach(() => {
  vi.clearAllMocks();
  process.env["EMAIL_SETTINGS_KEY"] = TEST_KEY;
  delete process.env["ORG_EMAIL_HOURLY_CAP"];
  mockSendMail.mockReset().mockResolvedValue(undefined);
  mockEval.mockReset().mockResolvedValue(1);
  mockBuildTransport.mockReset().mockReturnValue({ send: mockProviderSend });
  mockProviderSend.mockReset().mockResolvedValue({ ok: true });
  prisma.organization.findUnique.mockReset().mockResolvedValue(parentOrg);
  prisma.orgEmailSettings.findUnique.mockReset().mockResolvedValue(settings());
  prisma.orgEmailSettings.update.mockReset().mockResolvedValue({});
  prisma.orgEmailSettings.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prisma.user.findMany.mockReset().mockResolvedValue([{ email: "admin@acme.test" }]);
});

// Route resolution is internal (it holds the decrypted config); it is observed through which sender was used.
const viaProvider = () => mockProviderSend.mock.calls.length === 1 && mockSendMail.mock.calls.length === 0;
const viaDefault = () => mockProviderSend.mock.calls.length === 0 && mockSendMail.mock.calls.length === 1;

describe("route resolution (observed through sendOrgMail)", () => {
  it("own verified settings for a parent; the settings are read for that org", async () => {
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(viaProvider()).toBe(true);
    expect(mockBuildTransport.mock.calls[0]![0]).toMatchObject({ provider: "sendgrid", apiKey: SECRET });
    expect(prisma.orgEmailSettings.findUnique.mock.calls[0]![0].where).toEqual({ organizationId: "parent-1" });
  });
  it("client of an approved parent uses the parent settings", async () => {
    prisma.organization.findUnique.mockResolvedValue(clientOrg());
    await sendOrgMail(db, { orgId: "client-1", ...args });
    expect(viaProvider()).toBe(true);
    expect(prisma.orgEmailSettings.findUnique.mock.calls[0]![0].where).toEqual({ organizationId: "parent-1" });
  });
  it("client of a parent without white-label => default, no settings query", async () => {
    prisma.organization.findUnique.mockResolvedValue(clientOrg({ isParent: true, whiteLabelEnabled: false }));
    await sendOrgMail(db, { orgId: "client-1", ...args });
    expect(viaDefault()).toBe(true);
    expect(prisma.orgEmailSettings.findUnique).not.toHaveBeenCalled();
  });
  it.each(["unverified", "failing"])("%s => default, no bookkeeping", async (status) => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(settings({ status }));
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(viaDefault()).toBe(true);
    expect(prisma.orgEmailSettings.update).not.toHaveBeenCalled();
  });
  it("no settings => default; unknown org => default", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(null);
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(viaDefault()).toBe(true);
    mockSendMail.mockClear();
    prisma.organization.findUnique.mockResolvedValue(null);
    await sendOrgMail(db, { orgId: "x", ...args });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockProviderSend).not.toHaveBeenCalled();
  });
  it("decrypt failure or missing key => default, one warn each, no throw", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(settings({ configEnc: "garbage" }));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args, logger })).resolves.toBeUndefined();
    expect(viaDefault()).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const valid = settings();
    delete process.env["EMAIL_SETTINGS_KEY"];
    prisma.orgEmailSettings.findUnique.mockResolvedValue(valid);
    mockSendMail.mockClear();
    await sendOrgMail(db, { orgId: "parent-1", ...args, logger });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
  it("a throwing query => default", async () => {
    prisma.organization.findUnique.mockRejectedValue(new Error("db down"));
    await sendOrgMail(db, { orgId: "parent-1", ...args, logger });
    expect(viaDefault()).toBe(true);
  });
});

describe("countsTowardFailing", () => {
  it.each([
    "HTTP 400: rejected by provider",
    "HTTP 422: rejected by provider, code 406",
    "rejected by provider, code 406",
    "rejected by server",
    "temporary failure",
    "invalid email address",
  ])("%s does not count", (r) => expect(countsTowardFailing(r)).toBe(false));
  it.each([
    "HTTP 401: authentication failed",
    "HTTP 403: authentication failed, code 1",
    "authentication failed",
    "certificate not trusted",
    "connection failed",
    "HTTP 503: provider unavailable",
    "HTTP 429: rate limited",
    "host not allowed",
    "relay unavailable",
    "relay not authorised",
    "relay rejected request",
    "invalid configuration",
    "unexpected redirect",
    "unexpected provider response",
    "send failed",
  ])("%s counts", (r) => expect(countsTowardFailing(r)).toBe(true));
});

describe("sendOrgMail default path", () => {
  it("null orgId: sendMail with exactly today's arguments, no queries", async () => {
    await sendOrgMail(db, { orgId: null, ...args });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0]![0]).toStrictEqual({ to: "u@x.test", subject: "Subj", html: "<p>hi</p>" });
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
  it("no route: default path carries brand extras", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(null);
    await sendOrgMail(db, { orgId: "parent-1", ...args, brand });
    expect(mockSendMail.mock.calls[0]![0]).toStrictEqual({ ...args, fromName: "Acme Msgs", replyTo: "brand@acme.test" });
    expect(mockBuildTransport).not.toHaveBeenCalled();
  });
});

describe("sendOrgMail via provider", () => {
  it("happy path: provider only, right From and Reply-To, no write", async () => {
    await sendOrgMail(db, { orgId: "parent-1", ...args, brand });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
    expect(mockProviderSend.mock.calls[0]![0]).toEqual({
      from: { name: "Acme", address: "no-reply@acme.test" },
      ...args,
      replyTo: "help@acme.test",
    });
    expect(prisma.orgEmailSettings.update).not.toHaveBeenCalled();
    expect(prisma.orgEmailSettings.updateMany).not.toHaveBeenCalled();
    expect(mockEval.mock.calls[0]![2]).toBe("org-email-cap:parent-1");
  });
  it("falls back to the brand name and support email", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(settings({ fromName: null, replyTo: null }));
    await sendOrgMail(db, { orgId: "parent-1", ...args, brand });
    expect(mockProviderSend.mock.calls[0]![0]).toMatchObject({ from: { name: "Acme Msgs" }, replyTo: "brand@acme.test" });
  });
  it("resets a non-zero counter on success", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(settings({ consecutiveFailures: 2 }));
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(prisma.orgEmailSettings.updateMany).toHaveBeenCalledWith({
      where: { id: "set-1", consecutiveFailures: { gt: 0 } },
      data: { consecutiveFailures: 0, lastError: null },
    });
  });
  it("a throwing reset never breaks the send", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue(settings({ consecutiveFailures: 1 }));
    prisma.orgEmailSettings.updateMany.mockRejectedValue(new Error("db"));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args, logger })).resolves.toBeUndefined();
  });
});

describe("sendOrgMail failure", () => {
  it("failed send: one default send with identical args, increment with the sanitized reason", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: false, reason: "the provider rejected the credentials" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 1 });
    await sendOrgMail(db, { orgId: "parent-1", ...args, brand });
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0]![0]).toStrictEqual({ ...args, fromName: "Acme Msgs", replyTo: "brand@acme.test" });
    expect(prisma.orgEmailSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "set-1", updatedAt: UPDATED_AT },
        data: { consecutiveFailures: { increment: 1 }, lastError: "the provider rejected the credentials", updatedAt: UPDATED_AT },
      }),
    );
    expect(prisma.orgEmailSettings.updateMany).not.toHaveBeenCalled();
  });
  it("a thrown error: secret nowhere, lastError is the fixed string", async () => {
    mockProviderSend.mockRejectedValue(new Error(`boom ${SECRET}`));
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 3 });
    await sendOrgMail(db, { orgId: "parent-1", ...args, logger });
    const dump = JSON.stringify([
      prisma.orgEmailSettings.update.mock.calls,
      prisma.orgEmailSettings.updateMany.mock.calls,
      logger.warn.mock.calls,
      mockSendMail.mock.calls,
    ]);
    expect(dump).not.toContain(SECRET);
    expect(prisma.orgEmailSettings.update.mock.calls[0]![0].data.lastError).toBe("send failed");
  });
  it("a thrown buildTransport (bad config) also falls back", async () => {
    mockBuildTransport.mockImplementation(() => {
      throw new Error(`bad ${SECRET}`);
    });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 1 });
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
  it("third failure flips to failing once and notifies the owner's admins from the default sender", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "the provider timed out" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 3 });
    prisma.user.findMany.mockResolvedValue([{ email: "a1@acme.test" }, { email: "a2@acme.test" }]);
    prisma.organization.findUnique.mockResolvedValue(clientOrg());
    await sendOrgMail(db, { orgId: "client-1", ...args });
    expect(prisma.orgEmailSettings.updateMany).toHaveBeenCalledWith({
      where: { id: "set-1", status: "verified", updatedAt: UPDATED_AT },
      data: { status: "failing", updatedAt: UPDATED_AT },
    });
    const q = prisma.user.findMany.mock.calls[0]![0];
    expect(q.where).toMatchObject({ organizationId: "parent-1", role: "admin", isActive: true });
    expect(q.take).toBe(5);
    const notices = mockSendMail.mock.calls.slice(1).map((c) => c[0] as { to: string | string[]; html: string });
    expect(notices.length).toBeGreaterThan(0);
    const recipients = notices.flatMap((n) => (Array.isArray(n.to) ? n.to : [n.to]));
    expect([...recipients].sort()).toEqual(["a1@acme.test", "a2@acme.test"]);
    for (const n of notices) {
      expect(n.html).toContain("the provider timed out");
      expect(n.html).toContain("Settings");
      expect(n.html).not.toContain(SECRET);
      expect(n).not.toHaveProperty("fromName");
    }
  });
  it("concurrent failure that lost the flip race sends no second notification", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "x" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 4 });
    prisma.orgEmailSettings.updateMany.mockResolvedValue({ count: 0 });
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it("below three failures: no flip", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "x" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 2 });
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(prisma.orgEmailSettings.updateMany).not.toHaveBeenCalled();
  });
  it("a throwing prisma update never prevents the fallback email", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "x" });
    prisma.orgEmailSettings.update.mockRejectedValue(new Error("db down"));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args, logger })).resolves.toBeUndefined();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
  it("a failing notification is swallowed", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "x" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 3 });
    mockSendMail.mockResolvedValueOnce(undefined).mockRejectedValue(new Error("relay down"));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args, logger })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
  it("notification with no admins sends nothing extra", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "x" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 3 });
    prisma.user.findMany.mockResolvedValue([]);
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe("sendOrgMail failure classes and edge cases", () => {
  it.each(["HTTP 400: rejected by provider", "rejected by server", "temporary failure"])(
    "recipient-level failure (%s): fallback once, no increment, lastError recorded, no flip",
    async (reason) => {
      mockProviderSend.mockResolvedValue({ ok: false, retryable: false, reason });
      prisma.orgEmailSettings.findUnique.mockResolvedValue(settings({ consecutiveFailures: 2 }));
      await sendOrgMail(db, { orgId: "parent-1", ...args });
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(prisma.orgEmailSettings.update).not.toHaveBeenCalled();
      expect(prisma.orgEmailSettings.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.orgEmailSettings.updateMany).toHaveBeenCalledWith({
        where: { id: "set-1", updatedAt: UPDATED_AT },
        data: { lastError: reason, updatedAt: UPDATED_AT },
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    "HTTP 401: authentication failed",
    "connection failed",
    "HTTP 503: provider unavailable",
    "HTTP 429: rate limited",
    "certificate not trusted",
    "host not allowed",
    "relay unavailable",
    "relay not authorised",
  ])("connection-level failure (%s) increments", async (reason) => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 1 });
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(prisma.orgEmailSettings.update).toHaveBeenCalledTimes(1);
  });
  it("repeated recipient-level failures never flip the setting", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: false, reason: "rejected by server" });
    for (let i = 0; i < 5; i++) await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(prisma.orgEmailSettings.update).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(5);
  });
  it("stale snapshot (settings changed): bookkeeping skipped silently, fallback still sent", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "connection failed" });
    prisma.orgEmailSettings.update.mockRejectedValue(Object.assign(new Error("not found"), { code: "P2025" }));
    await sendOrgMail(db, { orgId: "parent-1", ...args, logger });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(prisma.orgEmailSettings.updateMany).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
  it("one failing admin notice does not stop the others", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "connection failed" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 3 });
    prisma.user.findMany.mockResolvedValue([{ email: "a1@acme.test" }, { email: "a2@acme.test" }, { email: "a3@acme.test" }]);
    mockSendMail.mockImplementation(async (m: { to: string }) => {
      if (m.to === "a1@acme.test") throw new Error("relay down");
    });
    await sendOrgMail(db, { orgId: "parent-1", ...args, logger });
    const tos = mockSendMail.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(tos).toEqual(expect.arrayContaining(["a1@acme.test", "a2@acme.test", "a3@acme.test"]));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
  it("a failed fallback after a failed provider send propagates, and the failure was recorded", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "connection failed" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 1 });
    mockSendMail.mockRejectedValue(new Error("Email service returned 500"));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args })).rejects.toThrow("Email service returned 500");
    expect(prisma.orgEmailSettings.update).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
  it("a rejecting default send on the cap or redis-down path is attempted exactly once", async () => {
    mockEval.mockResolvedValue(201);
    mockSendMail.mockRejectedValue(new Error("relay down"));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args })).rejects.toThrow("relay down");
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    mockSendMail.mockClear();
    mockEval.mockRejectedValue(new Error("redis down"));
    await expect(sendOrgMail(db, { orgId: "parent-1", ...args, logger })).rejects.toThrow("relay down");
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe("sendOrgMail cap and redis", () => {
  it("over the default cap (200) => default path, provider untouched", async () => {
    mockEval.mockResolvedValue(201);
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(mockBuildTransport).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(prisma.orgEmailSettings.update).not.toHaveBeenCalled();
  });
  it("exactly at the cap still uses the provider", async () => {
    mockEval.mockResolvedValue(200);
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
  });
  it("ORG_EMAIL_HOURLY_CAP overrides; garbage or <1 falls back to 200", async () => {
    process.env["ORG_EMAIL_HOURLY_CAP"] = "5";
    mockEval.mockResolvedValue(6);
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockProviderSend).not.toHaveBeenCalled();
    process.env["ORG_EMAIL_HOURLY_CAP"] = "abc";
    mockEval.mockResolvedValue(150);
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
    process.env["ORG_EMAIL_HOURLY_CAP"] = "0";
    await sendOrgMail(db, { orgId: "parent-1", ...args });
    expect(mockProviderSend).toHaveBeenCalledTimes(2);
  });
  it("redis down => default path", async () => {
    mockEval.mockRejectedValue(new Error("redis down"));
    await sendOrgMail(db, { orgId: "parent-1", ...args, logger });
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});
