import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type * as TransportModule from "../lib/email/transport.js";

const mockSendMail = vi.hoisted(() => vi.fn());
vi.mock("../lib/mail.js", () => ({ sendMail: (...a: unknown[]) => mockSendMail(...a) }));
vi.mock("../lib/redis.js", () => ({ redis: { eval: vi.fn().mockResolvedValue(1) } }));
const mockProviderSend = vi.hoisted(() => vi.fn());
vi.mock("../lib/email/transport.js", async (orig) => ({
  ...(await orig<typeof TransportModule>()),
  buildTransport: () => ({ send: (...a: unknown[]) => mockProviderSend(...a) }),
}));

import { sendCodeEmailToAccount, sendPasswordChangedToAccount } from "./brand-mail.js";
import { encryptJson } from "../lib/secret-box.js";

const parentFields = {
  isParent: true,
  whiteLabelEnabled: true,
  brandName: "Acme Msgs",
  brandColor: "#112233",
  brandSupportEmail: "help@acme.test",
  brandHidePoweredBy: false,
  slug: "acme",
  logoImage: null,
  smallLogoImage: null,
  favicon: null,
  darkLogoImage: null,
  darkSmallLogoImage: null,
  darkFavicon: null,
};
const clientOrg = (approved: boolean) => ({
  isParent: false,
  whiteLabelEnabled: false,
  brandName: null,
  parentOrganizationId: "parent-1",
  parentOrganization: { ...parentFields, whiteLabelEnabled: approved, parentOrganization: null },
});

const prisma = {
  authAccount: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  orgEmailSettings: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};
const db = prisma as unknown as PrismaClient;

beforeEach(() => {
  process.env["EMAIL_SETTINGS_KEY"] = Buffer.alloc(32, 7).toString("base64");
  mockSendMail.mockReset().mockResolvedValue(undefined);
  mockProviderSend.mockReset().mockResolvedValue({ ok: true });
  prisma.authAccount.findUnique.mockReset().mockResolvedValue({ id: "u1" });
  prisma.user.findUnique.mockReset().mockResolvedValue({ organizationId: "client-1" });
  prisma.organization.findUnique.mockReset().mockResolvedValue(clientOrg(true));
  prisma.orgEmailSettings.findUnique.mockReset().mockResolvedValue({
    id: "set-1",
    provider: "sendgrid",
    fromAddress: "no-reply@acme.test",
    fromName: "Acme",
    replyTo: null,
    configEnc: encryptJson({ provider: "sendgrid", apiKey: "fake-key-12345" }),
    status: "verified",
    consecutiveFailures: 0,
  });
});

describe("account emails choose the sending provider by the recipient's organization", () => {
  it("a client user of an approved parent: the code goes through OUR sender with the parent's brand, never the parent's provider", async () => {
    await sendCodeEmailToAccount(db, "c@x.test", "signin_email", "123456");
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0]![0]).toMatchObject({ fromName: "Acme Msgs", replyTo: "help@acme.test", subject: "Your Acme Msgs sign-in code", to: "c@x.test" });
  });
  it("password-changed for a client also goes through our sender", async () => {
    await sendPasswordChangedToAccount(db, "c@x.test");
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
  it("parent not approved for white-label: default path, golden unbranded arguments", async () => {
    prisma.organization.findUnique.mockResolvedValue(clientOrg(false));
    await sendCodeEmailToAccount(db, "c@x.test", "signin_email", "123456");
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const arg = mockSendMail.mock.calls[0]![0];
    expect(Object.keys(arg).sort()).toEqual(["html", "subject", "to"]);
    expect(arg.subject).toBe("Your WBMSG sign-in code");
  });
  it("provider not verified: default path with the branded arguments as today", async () => {
    prisma.orgEmailSettings.findUnique.mockResolvedValue({ id: "set-1", status: "unverified" });
    await sendCodeEmailToAccount(db, "c@x.test", "signin_email", "123456");
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(mockSendMail.mock.calls[0]![0]).toMatchObject({ fromName: "Acme Msgs", replyTo: "help@acme.test", subject: "Your Acme Msgs sign-in code" });
  });
  it("provider failure: the code email still goes out once through the default path", async () => {
    mockProviderSend.mockResolvedValue({ ok: false, retryable: true, reason: "the provider timed out" });
    prisma.orgEmailSettings.update.mockResolvedValue({ consecutiveFailures: 1 });
    await sendCodeEmailToAccount(db, "c@x.test", "signin_email", "123456");
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0]![0]).toMatchObject({ to: "c@x.test", fromName: "Acme Msgs", subject: "Your Acme Msgs sign-in code" });
  });
  it("unknown account: exactly today's default call, no organization lookups", async () => {
    prisma.authAccount.findUnique.mockResolvedValue(null);
    await sendCodeEmailToAccount(db, "nobody@x.test", "signin_email", "123456");
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    const arg = mockSendMail.mock.calls[0]![0];
    expect(Object.keys(arg).sort()).toEqual(["html", "subject", "to"]);
    expect(arg.subject).toBe("Your WBMSG sign-in code");
  });
});
