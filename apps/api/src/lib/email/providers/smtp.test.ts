import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTransport, redactConfig, validateProviderConfig, type OutboundEmail } from "../transport.js";
import { PRESETS, buildSmtpTransport, presetFor, validateSmtpConfig, type SmtpConfig } from "./smtp.js";

const PASS = "test-pass-123";
const good = {
  host: "smtp.example.com",
  port: 587,
  security: "starttls",
  user: "mailer@example.com",
  pass: PASS,
  fromAddress: "noreply@example.com",
};
const mail: OutboundEmail = {
  from: { name: "Acme Support", address: "noreply@example.com" },
  to: "user@example.org",
  subject: "Hello",
  html: "<p>Hi</p>",
  replyTo: "reply@example.com",
};

describe("validateSmtpConfig", () => {
  it("accepts a valid config and lowercases the host", () => {
    expect(validateSmtpConfig({ ...good, host: "SMTP.Example.com" })).toEqual({ ok: true, config: good });
  });
  it.each([
    [25, "starttls"], [465, "ssl"], [587, "starttls"], [2525, "starttls"],
  ])("accepts port %i with %s", (port, security) => {
    expect(validateSmtpConfig({ ...good, port, security }).ok).toBe(true);
  });
  it("accepts plain only together with allowPlain", () => {
    expect(validateSmtpConfig({ ...good, security: "plain" })).toMatchObject({ ok: false, field: "allowPlain" });
    expect(validateSmtpConfig({ ...good, security: "plain", allowPlain: true })).toEqual({
      ok: true,
      config: { ...good, security: "plain", allowPlain: true },
    });
    expect(validateSmtpConfig({ ...good, allowPlain: true })).toMatchObject({ ok: false, field: "allowPlain" });
    expect(validateSmtpConfig({ ...good, security: "ssl", allowPlain: "yes" })).toMatchObject({ ok: false, field: "allowPlain" });
  });
  it("drops extra fields", () => {
    const r = validateSmtpConfig({ ...good, proxy: "http://x", extra: 1 });
    expect(r).toEqual({ ok: true, config: good });
  });
  it.each([
    ["scheme", "http://smtp.example.com"], ["port in host", "smtp.example.com:587"], ["path", "smtp.example.com/x"],
    ["space", "smtp example.com"], ["userinfo", "u@smtp.example.com"], ["CRLF", "smtp.example.com\r\nX"],
    ["trailing dot", "smtp.example.com."], ["empty", ""], ["single label", "localhost"], ["too long", "a".repeat(250) + ".com"],
    ["decimal IP", "2130706433"], ["hex IP", "0x7f.1"], ["octal IP", "017700000001"], ["short IP", "127.1"],
    ["leading zero octet", "127.0.0.01"], ["octet > 255", "256.1.1.1"], ["numeric TLD", "example.123"], ["brackets", "[::1]"],
    ["underscore", "bad_host.example.com"], ["non-string", 5],
  ])("rejects host: %s", (_n, host) => {
    expect(validateSmtpConfig({ ...good, host })).toMatchObject({ ok: false, field: "host" });
  });
  it("accepts a dotted-quad and an IPv6 literal host", () => {
    expect(validateSmtpConfig({ ...good, host: "93.184.216.34" }).ok).toBe(true);
    expect(validateSmtpConfig({ ...good, host: "2606:2800:220:1::1" }).ok).toBe(true);
  });
  it.each([[22], [80], [1025], [0], [-1], [587.5], ["587"], [undefined]])("rejects port %j", (port) => {
    expect(validateSmtpConfig({ ...good, port })).toMatchObject({ ok: false, field: "port" });
  });
  it.each([["none"], ["tls"], [""], [1], [undefined]])("rejects security %j", (security) => {
    expect(validateSmtpConfig({ ...good, security })).toMatchObject({ ok: false, field: "security" });
  });
  it.each([
    ["missing", undefined], ["empty", ""], ["too long", "u".repeat(256)], ["CR", "a\rb"], ["LF", "a\nb"], ["NUL", "a\0b"], ["number", 5],
  ])("rejects user: %s", (_n, user) => {
    expect(validateSmtpConfig({ ...good, user })).toMatchObject({ ok: false, field: "user" });
  });
  it.each([
    ["missing", undefined], ["empty", ""], ["too long", "p".repeat(513)], ["CR", "a\rb"], ["LF", "a\nb"], ["NUL", "a\0b"],
  ])("rejects pass: %s", (_n, pass) => {
    expect(validateSmtpConfig({ ...good, pass })).toMatchObject({ ok: false, field: "pass" });
  });
  it("accepts boundary user/pass lengths", () => {
    expect(validateSmtpConfig({ ...good, user: "u".repeat(255), pass: "p".repeat(512) }).ok).toBe(true);
    expect(validateSmtpConfig({ ...good, user: "u", pass: "p" }).ok).toBe(true);
  });
  it.each([["Name <a@b.co>"], ["a@b.co, c@d.ef"], ["nope"], [""], [5]])("rejects fromAddress %j", (fromAddress) => {
    expect(validateSmtpConfig({ ...good, fromAddress })).toMatchObject({ ok: false, field: "fromAddress" });
  });
  it("rejects non-objects", () => {
    for (const v of [null, "x", 5, [], undefined]) expect(validateSmtpConfig(v)).toMatchObject({ ok: false, field: "config" });
  });
  it("never echoes the password or user in a message", () => {
    const r = validateSmtpConfig({ ...good, port: 22, pass: "secret-pass-xyz" });
    expect(JSON.stringify(r)).not.toContain("secret-pass-xyz");
    const r2 = validateSmtpConfig({ ...good, host: "bad host", pass: "secret-pass-xyz" });
    expect(JSON.stringify(r2)).not.toContain("bad host");
  });
});

describe("transport.ts integration", () => {
  it("validateProviderConfig handles smtp", () => {
    expect(validateProviderConfig("smtp", good)).toEqual({ ok: true, config: { provider: "smtp", ...good } });
    expect(validateProviderConfig("smtp", { ...good, port: 22 })).toMatchObject({ ok: false, field: "port" });
    expect(validateProviderConfig("smtp", { apiKey: "test-key-123" })).toMatchObject({ ok: false });
  });
  it("redactConfig masks pass and keeps user", () => {
    const out = redactConfig({ provider: "smtp", ...good } as { provider: "smtp" } & SmtpConfig);
    expect(out.pass).toBe("***");
    expect(out.user).toBe(good.user);
    expect(JSON.stringify(out)).not.toContain(PASS);
  });
  it("buildTransport returns an smtp transport that posts to the relay", async () => {
    vi.stubEnv("WEB_URL", "https://web.example.test");
    vi.stubEnv("INTERNAL_EMAIL_SECRET", "s".repeat(40));
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const t = buildTransport({ provider: "smtp", ...good } as never, f as unknown as typeof fetch);
    expect(await t.send(mail)).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
  it("buildTransport still builds HTTP providers", () => {
    expect(typeof buildTransport({ provider: "resend", apiKey: "test-key-123" }).send).toBe("function");
  });
});

describe("buildSmtpTransport", () => {
  const SECRET = "s".repeat(40);
  const cfg = good as unknown as SmtpConfig;
  beforeEach(() => {
    vi.stubEnv("WEB_URL", "https://web.example.test/");
    vi.stubEnv("INTERNAL_EMAIL_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const mk = (status: number, body: unknown = {}) =>
    vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  const send = (f: ReturnType<typeof mk>, m = mail, c = cfg) => buildSmtpTransport(c, { fetchImpl: f as unknown as typeof fetch }).send(m);

  it("posts the relay request shape", async () => {
    const f = mk(200, { ok: true });
    expect(await send(f)).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://web.example.test/api/internal/send-email");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const h = init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe(`Bearer ${SECRET}`);
    expect(h["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      to: "user@example.org",
      subject: "Hello",
      html: "<p>Hi</p>",
      replyTo: "reply@example.com",
      fromName: "Acme Support",
      smtp: good,
    });
  });
  it("omits replyTo and fromName when absent", async () => {
    const f = mk(200);
    await send(f, { ...mail, replyTo: undefined as never, from: { name: null, address: "noreply@example.com" } });
    const body = JSON.parse((f.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("replyTo");
    expect(body).not.toHaveProperty("fromName");
  });
  it("sends allowPlain only when set", async () => {
    const f = mk(200);
    await send(f, mail, { ...cfg, security: "plain", allowPlain: true });
    expect(JSON.parse((f.mock.calls[0]?.[1] as RequestInit).body as string).smtp).toMatchObject({ security: "plain", allowPlain: true });
  });
  it.each([
    ["authentication failed", false], ["connection failed", true], ["certificate not trusted", false],
    ["rejected by server", false], ["temporary failure", true], ["host not allowed", false],
  ])("maps a 502 with reason %s", async (reason, retryable) => {
    expect(await send(mk(502, { ok: false, retryable, reason }))).toEqual({ ok: false, retryable, reason });
  });
  it("replaces an unknown 502 reason with a fixed one", async () => {
    const r = await send(mk(502, { ok: false, retryable: false, reason: `535 bad ${PASS}` }));
    expect(r).toEqual({ ok: false, retryable: false, reason: "send failed" });
    expect(JSON.stringify(r)).not.toContain(PASS);
  });
  it("maps a non-JSON 502 to relay unavailable", async () => {
    expect(await send(mk(502, "<html>Bad Gateway</html>"))).toEqual({ ok: false, retryable: true, reason: "relay unavailable" });
  });
  it("maps 401 to relay not authorised (not retryable)", async () => {
    expect(await send(mk(401, { error: "Unauthorized" }))).toEqual({ ok: false, retryable: false, reason: "relay not authorised" });
  });
  it.each([500, 503, 504])("maps %i to retryable relay unavailable", async (s) => {
    expect(await send(mk(s))).toEqual({ ok: false, retryable: true, reason: "relay unavailable" });
  });
  it("maps another 4xx to a non-retryable rejection", async () => {
    expect(await send(mk(400, { error: "Invalid smtp settings" }))).toEqual({ ok: false, retryable: false, reason: "relay rejected request" });
  });
  it("maps network errors and timeouts to retryable relay unavailable", async () => {
    const boom = vi.fn(async () => {
      throw new Error(`connect failed for ${PASS}`);
    });
    const r = await send(boom as never);
    expect(r).toEqual({ ok: false, retryable: true, reason: "relay unavailable" });
    expect(JSON.stringify(r)).not.toContain(PASS);
    const to = vi.fn(async () => {
      throw Object.assign(new Error("t"), { name: "TimeoutError" });
    });
    expect(await send(to as never)).toEqual({ ok: false, retryable: true, reason: "relay unavailable" });
  });
  it("does not retry when the relay is not configured", async () => {
    vi.stubEnv("WEB_URL", "");
    const f = mk(200);
    expect(await send(f)).toEqual({ ok: false, retryable: false, reason: "relay unavailable" });
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects an unsafe recipient before calling the relay", async () => {
    const f = mk(200);
    expect(await send(f, { ...mail, to: "a@b.co\r\nBcc: x@y.zz" })).toEqual({ ok: false, retryable: false, reason: "invalid email address" });
    expect(await send(f, { ...mail, to: "a@b.co, c@d.ef" })).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("never logs the password", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    await send(mk(502, { ok: false, retryable: false, reason: "authentication failed" }));
    await send(mk(500));
    const all = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join("\n");
    spies.forEach((s) => s.mockRestore());
    expect(all).not.toContain(PASS);
  });
});

describe("PRESETS", () => {
  it("has the five documented providers with their settings", () => {
    expect(presetFor("gmail")).toEqual({ host: "smtp.gmail.com", port: 587, security: "starttls" });
    expect(presetFor("microsoft365")).toEqual({ host: "smtp.office365.com", port: 587, security: "starttls" });
    expect(presetFor("ses", "eu-west-1")).toEqual({ host: "email-smtp.eu-west-1.amazonaws.com", port: 587, security: "starttls" });
    expect(presetFor("godaddy")).toEqual({ host: "smtpout.secureserver.net", port: 465, security: "ssl" });
    expect(presetFor("zoho")).toEqual({ host: "smtp.zoho.com", port: 465, security: "ssl" });
    expect(Object.keys(PRESETS).sort()).toEqual(["godaddy", "gmail", "microsoft365", "ses", "zoho"].sort());
  });
  it.each(["gmail", "microsoft365", "ses", "godaddy", "zoho"] as const)("%s passes validateSmtpConfig", (id) => {
    const p = presetFor(id, "us-east-1");
    expect(p).not.toBeNull();
    expect(validateSmtpConfig({ ...p, user: "u", pass: "p", fromAddress: "a@example.com" }).ok).toBe(true);
  });
  it.each(["us-east-1", "eu-central-1", "ap-southeast-2", "us-gov-west-1"])("accepts SES region %s", (r) => {
    const p = presetFor("ses", r);
    expect(p && validateSmtpConfig({ ...p, user: "u", pass: "p", fromAddress: "a@example.com" }).ok).toBe(true);
  });
  it.each(["", "evil.com/x", "us east 1", "US-EAST-1", "a".repeat(40), "us-east-1.evil.com", undefined])("rejects SES region %j", (r) => {
    expect(presetFor("ses", r as string)).toBeNull();
  });
});

describe("unsafe IP literal hosts are refused at save", () => {
  it.each([
    "127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1",
    "2001:10::1", "2001:20::1", "2001:2::1", "100.64.0.1", "0.0.0.0", "64:ff9b::7f00:1",
  ])("rejects %s", (host) => {
    expect(validateSmtpConfig({ ...good, host })).toEqual({ ok: false, field: "host", message: "This address is not allowed" });
  });
  it.each(["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"])("accepts public literal %s", (host) => {
    expect(validateSmtpConfig({ ...good, host })).toMatchObject({ ok: true, config: { host } });
  });
  it("normalises a public IPv4-mapped literal to the embedded IPv4", () => {
    expect(validateSmtpConfig({ ...good, host: "::ffff:93.184.216.34" })).toMatchObject({ ok: true, config: { host: "93.184.216.34" } });
  });
  it("hostnames stay format-only (the relay re-checks at send time)", () => {
    expect(validateSmtpConfig({ ...good, host: "localhost.example.com" }).ok).toBe(true);
  });
});

describe("presetFor own-property check", () => {
  it.each(["__proto__", "toString", "constructor", "hasOwnProperty"])("rejects %s", (id) => {
    expect(presetFor(id as never)).toBeNull();
  });
});

describe("relay timeout", () => {
  it("is strictly greater than the relay maxDuration", async () => {
    const { SMTP_RELAY_TIMEOUT_MS } = await import("./smtp.js");
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../../../web/app/api/internal/send-email/route.ts", import.meta.url), "utf8");
    const m = /export const maxDuration = (\d+);/.exec(src);
    expect(m).not.toBeNull();
    expect(SMTP_RELAY_TIMEOUT_MS).toBeGreaterThan(Number(m?.[1]) * 1000);
    expect(SMTP_RELAY_TIMEOUT_MS).toBe(35_000);
  });
  it("uses that timeout for the relay call", async () => {
    vi.stubEnv("WEB_URL", "https://web.example.test");
    vi.stubEnv("INTERNAL_EMAIL_SECRET", "s".repeat(40));
    const spy = vi.spyOn(AbortSignal, "timeout");
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await buildSmtpTransport(good as unknown as SmtpConfig, { fetchImpl: f as unknown as typeof fetch }).send(mail);
    expect(spy).toHaveBeenCalledWith(35_000);
    spy.mockRestore();
    vi.unstubAllEnvs();
  });
});
