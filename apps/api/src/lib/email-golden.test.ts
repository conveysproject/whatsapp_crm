import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOLDEN } from "./email-golden.fixtures.js";

const sendMail = vi.fn();
vi.mock("./mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { sendCodeEmail, sendPasswordChangedEmail } from "../auth/emails.js";
import {
  buildClientInvitationEmail,
  buildInvitationEmail,
  CLIENT_INVITATION_SUBJECT,
  INVITATION_SUBJECT,
} from "./invitation-email.js";
import { DEFAULT_BRAND } from "./brand.js";

const PURPOSES = ["email_verify", "signin_email", "signin_whatsapp", "new_device", "password_reset", "phone_verify"] as const;
const INVITE_URL = "https://app.example.com/invitations/tok/accept";
const CLIENT_URL = "https://app.example.com/client-invitations/tok/accept";

function sent(): { subject: string; html: string } {
  const a = sendMail.mock.calls[0]![0];
  return { subject: a.subject, html: a.html };
}

describe("unbranded emails stay byte-identical", () => {
  beforeEach(() => sendMail.mockReset().mockResolvedValue(undefined));

  for (const p of PURPOSES) {
    it(`code email ${p}`, async () => {
      await sendCodeEmail("a@b.com", p, "123456");
      expect(sent()).toEqual(GOLDEN["code_" + p]);
    });
    it(`code email ${p} with the default brand`, async () => {
      await sendCodeEmail("a@b.com", p, "123456", undefined, DEFAULT_BRAND);
      expect(sent()).toEqual(GOLDEN["code_" + p]);
      expect(Object.keys(sendMail.mock.calls[0]![0]).sort()).toEqual(["html", "subject", "to"]);
    });
  }
  it("code email with a custom lead", async () => {
    await sendCodeEmail("a@b.com", "email_verify", "123456", "Custom lead for WBMSG.");
    expect(sent()).toEqual(GOLDEN["code_lead"]);
  });
  it("password changed", async () => {
    await sendPasswordChangedEmail("a@b.com");
    expect(sent()).toEqual(GOLDEN["pwchanged"]);
    sendMail.mockReset().mockResolvedValue(undefined);
    await sendPasswordChangedEmail("a@b.com", DEFAULT_BRAND);
    expect(sent()).toEqual(GOLDEN["pwchanged"]);
    expect(Object.keys(sendMail.mock.calls[0]![0]).sort()).toEqual(["html", "subject", "to"]);
  });
  it("team invitation", () => {
    const expected = GOLDEN["invite"]!;
    expect(INVITATION_SUBJECT).toBe(expected.subject);
    expect(buildInvitationEmail({ role: "admin", acceptUrl: INVITE_URL })).toBe(expected.html);
    expect(buildInvitationEmail({ role: "admin", acceptUrl: INVITE_URL, brand: DEFAULT_BRAND })).toBe(expected.html);
  });
  it("client invitation", () => {
    const expected = GOLDEN["clientInvite"]!;
    expect(CLIENT_INVITATION_SUBJECT).toBe(expected.subject);
    expect(buildClientInvitationEmail({ parentName: "Acme Co", acceptUrl: CLIENT_URL })).toBe(expected.html);
    expect(buildClientInvitationEmail({ parentName: "Acme Co", acceptUrl: CLIENT_URL, brand: DEFAULT_BRAND })).toBe(expected.html);
  });
});
