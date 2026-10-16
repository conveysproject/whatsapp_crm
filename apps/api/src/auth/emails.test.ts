import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMail = vi.fn();
vi.mock("../lib/mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { sendCodeEmail, sendPasswordChangedEmail } from "./emails.js";

describe("auth emails", () => {
  beforeEach(() => sendMail.mockReset().mockResolvedValue(undefined));

  it("puts the code in the HTML, never the subject", async () => {
    await sendCodeEmail("a@b.com", "signin_email", "123456");
    const arg = sendMail.mock.calls[0]![0];
    expect(arg.to).toBe("a@b.com");
    expect(arg.html).toContain("123456");
    expect(arg.subject).not.toContain("123456");
    expect(arg.subject).toContain("WBMSG");
    expect(arg.html).toContain("10 minutes");
    expect(arg.html).toContain("If you didn't ask for this, you can ignore this email.");
  });

  it("has a subject for every purpose", async () => {
    const purposes = ["email_verify", "signin_email", "signin_whatsapp", "new_device", "password_reset", "phone_verify"] as const;
    for (const p of purposes) await sendCodeEmail("a@b.com", p, "654321");
    const subjects = sendMail.mock.calls.map((c) => c[0].subject);
    expect(new Set(subjects).size).toBeGreaterThanOrEqual(5);
  });

  it("rejects a non-numeric code (no HTML injection)", async () => {
    await expect(sendCodeEmail("a@b.com", "signin_email", "<b>x</b>")).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends the password-changed notice", async () => {
    await sendPasswordChangedEmail("a@b.com");
    const arg = sendMail.mock.calls[0]![0];
    expect(arg.subject).toContain("password");
    expect(arg.html).toContain("WBMSG");
  });
});
