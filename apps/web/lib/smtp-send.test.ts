import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const close = vi.fn();
const createTransport = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: (...a: unknown[]) => createTransport(...a) } }));

import { sendViaSmtp, type SmtpSettings } from "./smtp-send";

const PASS = "test-pass-123";
const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
const base: SmtpSettings = {
  host: "smtp.example.com",
  port: 587,
  security: "starttls",
  user: "mailer@example.com",
  pass: PASS,
  fromAddress: "noreply@example.com",
};
const msg = { to: "rcpt@example.org", subject: "Hello", html: "<p>hi</p>", fromName: "Acme" };
const run = (smtp: Record<string, unknown> = {}, m: Record<string, unknown> = {}) =>
  sendViaSmtp({ ...base, ...smtp } as SmtpSettings, { ...msg, ...m } as typeof msg, { lookup });

let logSpies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({ accepted: ["rcpt@example.org"] });
  close.mockReset();
  createTransport.mockReset().mockImplementation(() => ({ sendMail, close }));
  lookup.mockClear();
  logSpies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
});
afterEach(() => logSpies.forEach((s) => s.mockRestore()));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opts = () => createTransport.mock.calls[0]?.[0] as Record<string, any>;

describe("connect options", () => {
  it("connects to the resolved IP and verifies the certificate against the original hostname", async () => {
    expect(await run()).toEqual({ ok: true });
    const o = opts();
    expect(o.host).toBe("93.184.216.34");
    expect(o.port).toBe(587);
    expect(o.tls).toEqual({ servername: "smtp.example.com", rejectUnauthorized: true, minVersion: "TLSv1.2" });
    expect(o.connectionTimeout).toBe(10000);
    expect(o.greetingTimeout).toBe(10000);
    expect(o.socketTimeout).toBe(20000);
    expect(o.disableFileAccess).toBe(true);
    expect(o.disableUrlAccess).toBe(true);
    expect(o.auth).toEqual({ user: "mailer@example.com", pass: PASS });
    expect(o.logger).toBe(false);
    expect(o.debug).toBe(false);
    expect(typeof o.name).toBe("string");
    expect(o.name.length).toBeGreaterThan(0);
    expect(o.pool).toBeFalsy();
  });
  it("omits servername for an IP literal host", async () => {
    await run({ host: "93.184.216.34" });
    expect(opts().host).toBe("93.184.216.34");
    expect(opts().tls).toEqual({ rejectUnauthorized: true, minVersion: "TLSv1.2" });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("starttls requires TLS", async () => {
    await run({ security: "starttls", port: 25 });
    expect(opts()).toMatchObject({ secure: false, requireTLS: true });
  });
  it("ssl uses implicit TLS", async () => {
    await run({ security: "ssl", port: 465 });
    expect(opts().secure).toBe(true);
  });
  it("plain only with allowPlain, then opportunistic STARTTLS", async () => {
    expect(await run({ security: "plain" })).toEqual({ ok: false, retryable: false, reason: "invalid configuration" });
    expect(createTransport).not.toHaveBeenCalled();
    expect(await run({ security: "plain", allowPlain: true })).toEqual({ ok: true });
    expect(opts()).toMatchObject({ secure: false, ignoreTLS: false });
    expect(opts().requireTLS).toBeFalsy();
  });
  it("creates a new transport per call", async () => {
    await run();
    await run();
    expect(createTransport).toHaveBeenCalledTimes(2);
  });
  it("sends one message to one recipient from the sanitised From", async () => {
    await run({}, { fromName: 'Ac"me\r\nBcc: x', replyTo: "help@example.com" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const m = sendMail.mock.calls[0]?.[0];
    expect(m.to).toBe("rcpt@example.org");
    expect(m.from).toEqual({ name: "Acme Bcc: x", address: "noreply@example.com" });
    expect(m.subject).toBe("Hello");
    expect(m.replyTo).toBe("help@example.com");
  });
});

describe("validation", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["port 22", { port: 22 }], ["port 1025", { port: 1025 }], ["port string", { port: "587" }],
    ["bad security", { security: "none" }], ["empty user", { user: "" }], ["long user", { user: "u".repeat(256) }],
    ["empty pass", { pass: "" }], ["long pass", { pass: "p".repeat(513) }],
    ["CR in user", { user: "a\rb" }], ["LF in pass", { pass: "a\nb" }], ["NUL in user", { user: "a\0b" }],
    ["bad from", { fromAddress: "Name <a@b.co>" }], ["from list", { fromAddress: "a@b.co,c@d.ef" }],
    ["allowPlain not boolean", { allowPlain: "yes" }],
  ];
  it.each(cases)("rejects %s without connecting", async (_n, over) => {
    expect(await run(over)).toEqual({ ok: false, retryable: false, reason: "invalid configuration" });
    expect(createTransport).not.toHaveBeenCalled();
  });
  it.each([
    ["to array", { to: ["a@b.co", "c@d.ef"] }], ["to list string", { to: "a@b.co, c@d.ef" }],
    ["to with name", { to: "N <a@b.co>" }], ["to CRLF", { to: "a@b.co\r\nBcc: x@y.zz" }],
  ])("rejects %s", async (_n, over) => {
    expect(await run({}, over)).toEqual({ ok: false, retryable: false, reason: "invalid configuration" });
    expect(createTransport).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "169.254.169.254", "10.0.0.1", "http://x.com", "2130706433", "smtp.example.com:25"])(
    "host %s => host not allowed",
    async (host) => {
      expect(await run({ host })).toEqual({ ok: false, retryable: false, reason: "host not allowed" });
      expect(createTransport).not.toHaveBeenCalled();
    },
  );
  it("host resolving to a private address => host not allowed", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }, { address: "192.168.0.9", family: 4 }]);
    expect(await run()).toEqual({ ok: false, retryable: false, reason: "host not allowed" });
  });
  it("unresolvable host => retryable connection failed", async () => {
    lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await run()).toEqual({ ok: false, retryable: true, reason: "connection failed" });
  });
});

describe("error mapping", () => {
  const e = (props: Record<string, unknown>, message = "SERVER SAID: secret-server-text") => Object.assign(new Error(message), props);
  const table: [string, unknown, boolean, string][] = [
    ["EAUTH", e({ code: "EAUTH", responseCode: 535 }), false, "authentication failed"],
    ["EAUTH no code", e({ code: "EAUTH" }), false, "authentication failed"],
    ["535", e({ responseCode: 535 }), false, "authentication failed"],
    ["ETIMEDOUT", e({ code: "ETIMEDOUT" }), true, "connection failed"],
    ["ECONNECTION", e({ code: "ECONNECTION" }), true, "connection failed"],
    ["ESOCKET", e({ code: "ESOCKET" }), true, "connection failed"],
    ["ECONNRESET", e({ code: "ECONNRESET" }), true, "connection failed"],
    ["EDNS", e({ code: "EDNS" }), true, "connection failed"],
    ["ALTNAME via cause", e({ code: "ESOCKET", cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } }), false, "certificate not trusted"],
    ["ALTNAME direct", e({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }), false, "certificate not trusted"],
    ["expired", e({ code: "CERT_HAS_EXPIRED" }), false, "certificate not trusted"],
    ["self signed", e({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }), false, "certificate not trusted"],
    ["leaf", e({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }), false, "certificate not trusted"],
    ["chain", e({ code: "SELF_SIGNED_CERT_IN_CHAIN" }), false, "certificate not trusted"],
    ["EENVELOPE", e({ code: "EENVELOPE" }), false, "rejected by server"],
    ["550", e({ code: "EENVELOPE", responseCode: 550 }), false, "rejected by server"],
    ["554 EMESSAGE", e({ code: "EMESSAGE", responseCode: 554 }), false, "rejected by server"],
    ["451", e({ code: "EMESSAGE", responseCode: 451 }), true, "temporary failure"],
    ["421", e({ responseCode: 421 }), true, "temporary failure"],
    ["unknown", e({ code: "WEIRD" }), true, "send failed"],
    ["non-error", "boom", true, "send failed"],
  ];
  it.each(table)("%s", async (_n, err, retryable, reason) => {
    sendMail.mockRejectedValueOnce(err);
    const r = await run();
    expect(r).toEqual({ ok: false, retryable, reason });
    expect(JSON.stringify(r)).not.toMatch(/secret-server-text|test-pass|mailer@/);
  });
  it("never logs credentials or server text", async () => {
    sendMail.mockRejectedValueOnce(e({ code: "EAUTH" }, `535 bad ${PASS} for mailer@example.com`));
    await run();
    const all = logSpies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join("\n");
    expect(all).not.toContain(PASS);
    expect(all).not.toContain("535 bad");
  });
});

describe("transport lifecycle", () => {
  it("closes after success", async () => {
    await run();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("closes after failure", async () => {
    sendMail.mockRejectedValueOnce(new Error("x"));
    await run();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("survives close throwing without failing a sent message", async () => {
    close.mockImplementationOnce(() => {
      throw new Error("c");
    });
    expect(await run()).toEqual({ ok: true });
  });
  it("maps a createTransport throw", async () => {
    createTransport.mockImplementationOnce(() => {
      throw new Error("bad opts");
    });
    expect(await run()).toEqual({ ok: false, retryable: true, reason: "send failed" });
  });
});
