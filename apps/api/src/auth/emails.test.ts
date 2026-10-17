import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

  describe("dev code sink", () => {
    const saved = { env: process.env["NODE_ENV"], flag: process.env["AUTH_DEV_LOG_CODES"] };
    let info: { mockRestore: () => void } & ReturnType<typeof vi.fn>;
    beforeEach(() => {
      info = vi.spyOn(console, "info").mockImplementation(() => undefined) as unknown as typeof info;
    });
    afterEach(() => {
      info.mockRestore();
      if (saved.env === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = saved.env;
      if (saved.flag === undefined) delete process.env["AUTH_DEV_LOG_CODES"];
      else process.env["AUTH_DEV_LOG_CODES"] = saved.flag;
    });

    it("logs the code when not production and the flag is 1", async () => {
      process.env["NODE_ENV"] = "development";
      process.env["AUTH_DEV_LOG_CODES"] = "1";
      await sendCodeEmail("a@b.com", "new_device", "123456");
      expect(info).toHaveBeenCalledWith("[dev-code] new_device a@b.com 123456");
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("never logs in production, even with the flag set", async () => {
      process.env["NODE_ENV"] = "production";
      process.env["AUTH_DEV_LOG_CODES"] = "1";
      await sendCodeEmail("a@b.com", "new_device", "123456");
      expect(info).not.toHaveBeenCalled();
    });

    it("never logs when NODE_ENV is unset or staging, even with the flag set", async () => {
      process.env["AUTH_DEV_LOG_CODES"] = "1";
      delete process.env["NODE_ENV"];
      await sendCodeEmail("a@b.com", "new_device", "123456");
      process.env["NODE_ENV"] = "staging";
      await sendCodeEmail("a@b.com", "new_device", "123456");
      expect(info).not.toHaveBeenCalled();
    });

    it("logs in the test environment with the flag", async () => {
      process.env["NODE_ENV"] = "test";
      process.env["AUTH_DEV_LOG_CODES"] = "1";
      await sendCodeEmail("a@b.com", "new_device", "123456");
      expect(info).toHaveBeenCalledTimes(1);
    });

    it("never logs when the flag is unset", async () => {
      process.env["NODE_ENV"] = "development";
      delete process.env["AUTH_DEV_LOG_CODES"];
      await sendCodeEmail("a@b.com", "new_device", "123456");
      expect(info).not.toHaveBeenCalled();
    });
  });
});
