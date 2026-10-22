import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailFn = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: sendMailFn }) } }));

describe("sendMail from header", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMailFn.mockReset().mockResolvedValue(undefined);
    vi.stubEnv("SMTP_USER", "smtp@example.com");
    vi.stubEnv("SMTP_PASS", "test-pass");
  });

  it("defaults to WBMSG", async () => {
    const { sendMail } = await import("./mail");
    await sendMail({ to: "a@b.co", subject: "s", html: "h" });
    expect(sendMailFn.mock.calls[0]![0].from).toEqual({ name: "WBMSG", address: "smtp@example.com" });
  });
  it("uses a sanitized fromName in address-object form", async () => {
    const { sendMail } = await import("./mail");
    await sendMail({ to: "a@b.co", subject: "s", html: "h", fromName: "Evil\r\nBcc: x@y.z" });
    const from = sendMailFn.mock.calls[0]![0].from;
    expect(from).toEqual({ name: "Evil Bcc: x@y.z", address: "smtp@example.com" });
    expect(typeof from).toBe("object");
  });
});
