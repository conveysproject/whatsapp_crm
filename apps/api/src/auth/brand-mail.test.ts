import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const m = vi.hoisted(() => ({ sendCodeEmail: vi.fn(), sendPasswordChangedEmail: vi.fn() }));
vi.mock("./emails.js", () => ({ sendCodeEmail: m.sendCodeEmail, sendPasswordChangedEmail: m.sendPasswordChangedEmail }));

import { sendCodeEmailToAccount, sendPasswordChangedToAccount } from "./brand-mail.js";

const orgRow = {
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
  parentOrganization: null,
};
const prismaFor = (account: unknown, user: unknown, org: unknown): PrismaClient =>
  ({
    authAccount: { findUnique: vi.fn().mockResolvedValue(account) },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    organization: { findUnique: vi.fn().mockResolvedValue(org) },
  }) as unknown as PrismaClient;

beforeEach(() => {
  m.sendCodeEmail.mockReset().mockResolvedValue(undefined);
  m.sendPasswordChangedEmail.mockReset().mockResolvedValue(undefined);
});

describe("sendCodeEmailToAccount", () => {
  it("unknown email: calls sendCodeEmail exactly as before (no extra args)", async () => {
    await sendCodeEmailToAccount(prismaFor(null, null, null), "x@y.z", "signin_email", "123456");
    expect(m.sendCodeEmail).toHaveBeenCalledWith("x@y.z", "signin_email", "123456");
    expect(m.sendCodeEmail.mock.calls[0]).toHaveLength(3);
  });
  it("keeps a custom lead and passes no brand for the default", async () => {
    await sendCodeEmailToAccount(prismaFor(null, null, null), "x@y.z", "email_verify", "123456", "Lead");
    expect(m.sendCodeEmail.mock.calls[0]).toEqual(["x@y.z", "email_verify", "123456", "Lead"]);
  });
  it("a recipient under an approved brand gets that brand", async () => {
    await sendCodeEmailToAccount(prismaFor({ id: "u1" }, { organizationId: "o1" }, orgRow), "x@y.z", "signin_email", "123456");
    const args = m.sendCodeEmail.mock.calls[0]!;
    expect(args.slice(0, 3)).toEqual(["x@y.z", "signin_email", "123456"]);
    expect(args[4]).toMatchObject({ name: "Acme Msgs", supportEmail: "help@acme.test" });
  });
  it("a failing lookup falls back to the unbranded send, never throws", async () => {
    const prisma = { authAccount: { findUnique: vi.fn().mockRejectedValue(new Error("down")) } } as unknown as PrismaClient;
    await sendCodeEmailToAccount(prisma, "x@y.z", "signin_email", "123456");
    expect(m.sendCodeEmail.mock.calls[0]).toHaveLength(3);
  });
});

describe("who may carry the code", () => {
  const deliver = (i: number) => m.sendCodeEmail.mock.calls[i]![5] as unknown;
  it("a parent's own user may use the parent's provider", async () => {
    await sendCodeEmailToAccount(prismaFor({ id: "u1" }, { organizationId: "o1" }, orgRow), "x@y.z", "signin_email", "123456");
    expect(typeof deliver(0)).toBe("function");
  });
  it("a client's code never goes through the parent's provider (default sender, parent brand kept)", async () => {
    const client = { ...orgRow, isParent: false, parentOrganizationId: "p1" };
    await sendCodeEmailToAccount(prismaFor({ id: "u1" }, { organizationId: "c1" }, client), "x@y.z", "password_reset", "123456");
    expect(deliver(0)).toBeUndefined();
  });
  it("a client's password-changed notice also uses the default sender", async () => {
    const client = { ...orgRow, isParent: false, parentOrganizationId: "p1" };
    await sendPasswordChangedToAccount(prismaFor({ id: "u1" }, { organizationId: "c1" }, client), "x@y.z");
    expect(m.sendPasswordChangedEmail.mock.calls[0]![2]).toBeUndefined();
  });
});

describe("sendPasswordChangedToAccount", () => {
  it("default: unchanged call", async () => {
    await sendPasswordChangedToAccount(prismaFor(null, null, null), "x@y.z");
    expect(m.sendPasswordChangedEmail.mock.calls[0]).toEqual(["x@y.z"]);
  });
  it("branded recipient", async () => {
    await sendPasswordChangedToAccount(prismaFor({ id: "u1" }, { organizationId: "o1" }, orgRow), "x@y.z");
    expect(m.sendPasswordChangedEmail.mock.calls[0]![1]).toMatchObject({ name: "Acme Msgs" });
  });
});
