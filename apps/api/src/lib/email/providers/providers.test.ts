import { describe, expect, it, vi } from "vitest";
import { buildHttpTransport, type ProviderConfig, type OutboundEmail } from "../transport.js";

const KEY = "test-key-123";
const mail: OutboundEmail = {
  from: { name: "Acme Support", address: "support@acme.test" },
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  replyTo: "reply@acme.test",
};

function mockFetch(status: number, body: unknown = {}, isText = false) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(isText ? String(body) : JSON.stringify(body), { status }),
  );
}
type F = ReturnType<typeof mockFetch>;
const call = (f: F) => {
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string>, json: () => JSON.parse(init.body as string) };
};
const send = (c: ProviderConfig, f: F, m: OutboundEmail = mail) => buildHttpTransport(c, f as unknown as typeof fetch).send(m);

const cfgs: ProviderConfig[] = [
  { provider: "sendgrid", apiKey: KEY },
  { provider: "mailgun", apiKey: KEY, domain: "mg.acme.test", region: "us" },
  { provider: "postmark", apiKey: KEY },
  { provider: "resend", apiKey: KEY },
  { provider: "brevo", apiKey: KEY },
  { provider: "sparkpost", apiKey: KEY },
];
const okStatus: Record<string, number> = { sendgrid: 202, mailgun: 200, postmark: 200, resend: 200, brevo: 201, sparkpost: 200 };
const okBody = (p: string) => (p === "postmark" ? { ErrorCode: 0, Message: "OK" } : {});

describe("request shapes", () => {
  it("sendgrid", async () => {
    const f = mockFetch(202);
    expect(await send({ provider: "sendgrid", apiKey: KEY }, f)).toEqual({ ok: true });
    const c = call(f);
    expect(c.url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(c.init.method).toBe("POST");
    expect(c.headers["Authorization"]).toBe(`Bearer ${KEY}`);
    expect(c.json()).toEqual({
      personalizations: [{ to: [{ email: "user@example.com" }] }],
      from: { email: "support@acme.test", name: "Acme Support" },
      reply_to: { email: "reply@acme.test" },
      subject: "Hello",
      content: [{ type: "text/html", value: "<p>Hi</p>" }],
    });
  });
  it("sendgrid eu host, no reply_to / name when absent", async () => {
    const f = mockFetch(202);
    await send({ provider: "sendgrid", apiKey: KEY, region: "eu" }, f, { ...mail, replyTo: undefined, from: { name: null, address: "a@b.test" } });
    const c = call(f);
    expect(c.url).toBe("https://api.eu.sendgrid.com/v3/mail/send");
    expect(c.json().reply_to).toBeUndefined();
    expect(c.json().from).toEqual({ email: "a@b.test" });
  });

  it("mailgun us/eu, basic auth, form body", async () => {
    const f = mockFetch(200);
    expect(await send(cfgs[1]!, f)).toEqual({ ok: true });
    const c = call(f);
    expect(c.url).toBe("https://api.mailgun.net/v3/mg.acme.test/messages");
    expect(c.headers["Authorization"]).toBe(`Basic ${Buffer.from(`api:${KEY}`).toString("base64")}`);
    expect(c.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const p = new URLSearchParams(c.init.body as string);
    expect(p.get("from")).toBe("Acme Support <support@acme.test>");
    expect(p.get("to")).toBe("user@example.com");
    expect(p.get("subject")).toBe("Hello");
    expect(p.get("html")).toBe("<p>Hi</p>");
    expect(p.get("h:Reply-To")).toBe("reply@acme.test");

    const f2 = mockFetch(200);
    await send({ provider: "mailgun", apiKey: KEY, domain: "mg.acme.test", region: "eu" }, f2, { ...mail, replyTo: undefined });
    expect(call(f2).url).toBe("https://api.eu.mailgun.net/v3/mg.acme.test/messages");
    expect(new URLSearchParams(call(f2).init.body as string).has("h:Reply-To")).toBe(false);
  });
  it("mailgun refuses a bad domain at build time without leaking the key", () => {
    let msg = "";
    try {
      buildHttpTransport({ provider: "mailgun", apiKey: KEY, domain: "x.com/../evil", region: "us" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBeTruthy();
    expect(msg).not.toContain(KEY);
  });

  it("postmark", async () => {
    const f = mockFetch(200, { ErrorCode: 0, Message: "OK" });
    expect(await send(cfgs[2]!, f)).toEqual({ ok: true });
    const c = call(f);
    expect(c.url).toBe("https://api.postmarkapp.com/email");
    expect(c.headers["X-Postmark-Server-Token"]).toBe(KEY);
    expect(c.json()).toEqual({
      From: "Acme Support <support@acme.test>",
      To: "user@example.com",
      Subject: "Hello",
      HtmlBody: "<p>Hi</p>",
      ReplyTo: "reply@acme.test",
      MessageStream: "outbound",
    });
  });
  it("postmark 200 with non-zero ErrorCode is a failure", async () => {
    const f = mockFetch(200, { ErrorCode: 406, Message: "Inactive recipient" });
    const r = await send(cfgs[2]!, f);
    expect(r).toMatchObject({ ok: false, retryable: false });
    expect((r as { reason: string }).reason).not.toContain("Inactive");
  });
  it("postmark 200 with unparseable body is a failure", async () => {
    const r = await send(cfgs[2]!, mockFetch(200, "<html>", true));
    expect(r).toMatchObject({ ok: false });
  });

  it("resend", async () => {
    const f = mockFetch(200, { id: "x" });
    expect(await send(cfgs[3]!, f)).toEqual({ ok: true });
    const c = call(f);
    expect(c.url).toBe("https://api.resend.com/emails");
    expect(c.headers["Authorization"]).toBe(`Bearer ${KEY}`);
    expect(c.json()).toEqual({
      from: "Acme Support <support@acme.test>",
      to: ["user@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      reply_to: "reply@acme.test",
    });
  });

  it("brevo", async () => {
    const f = mockFetch(201, { messageId: "x" });
    expect(await send(cfgs[4]!, f)).toEqual({ ok: true });
    const c = call(f);
    expect(c.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(c.headers["api-key"]).toBe(KEY);
    expect(c.json()).toEqual({
      sender: { name: "Acme Support", email: "support@acme.test" },
      to: [{ email: "user@example.com" }],
      subject: "Hello",
      htmlContent: "<p>Hi</p>",
      replyTo: { email: "reply@acme.test" },
    });
  });

  it("sparkpost us/eu, raw Authorization", async () => {
    const f = mockFetch(200, { results: {} });
    expect(await send(cfgs[5]!, f)).toEqual({ ok: true });
    const c = call(f);
    expect(c.url).toBe("https://api.sparkpost.com/api/v1/transmissions");
    expect(c.headers["Authorization"]).toBe(KEY);
    expect(c.json()).toEqual({
      content: { from: { email: "support@acme.test", name: "Acme Support" }, subject: "Hello", html: "<p>Hi</p>", reply_to: "reply@acme.test" },
      recipients: [{ address: { email: "user@example.com" } }],
    });
    const f2 = mockFetch(200);
    await send({ provider: "sparkpost", apiKey: KEY, region: "eu" }, f2);
    expect(call(f2).url).toBe("https://api.eu.sparkpost.com/api/v1/transmissions");
  });
});

describe.each(cfgs)("$provider common behaviour", (cfg) => {
  it("uses a timeout signal", async () => {
    const f = mockFetch(okStatus[cfg.provider]!, okBody(cfg.provider));
    await send(cfg, f);
    expect(call(f).init.signal).toBeInstanceOf(AbortSignal);
  });
  it("401 and 403 are non-retryable authentication failures", async () => {
    for (const s of [401, 403]) {
      const r = await send(cfg, mockFetch(s, { message: "nope" }));
      expect(r).toMatchObject({ ok: false, retryable: false });
      expect((r as { reason: string }).reason).toContain("authentication failed");
    }
  });
  it("400 and 422 are non-retryable rejections", async () => {
    for (const s of [400, 422]) {
      const r = await send(cfg, mockFetch(s, { message: "bad" }));
      expect(r).toMatchObject({ ok: false, retryable: false });
      expect((r as { reason: string }).reason).toContain("rejected by provider");
    }
  });
  it("429 and 5xx are retryable", async () => {
    for (const s of [429, 500, 502, 503]) {
      expect(await send(cfg, mockFetch(s))).toMatchObject({ ok: false, retryable: true });
    }
  });
  it("timeout is retryable", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const r = await send(cfg, f as unknown as F);
    expect(r).toMatchObject({ ok: false, retryable: true });
    expect((r as { reason: string }).reason).toContain("timeout");
  });
  it("abort is retryable", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    expect(await send(cfg, f as unknown as F)).toMatchObject({ ok: false, retryable: true });
  });
  it("network error is retryable and its message (which could hold the key) is not echoed", async () => {
    const f = vi.fn(async () => {
      throw new TypeError(`fetch failed for key ${KEY}`);
    });
    const r = await send(cfg, f as unknown as F);
    expect(r).toMatchObject({ ok: false, retryable: true });
    expect((r as { reason: string }).reason).not.toContain(KEY);
  });
  it("a provider response echoing the key never reaches reason", async () => {
    for (const s of [400, 401, 429, 500]) {
      const r = await send(cfg, mockFetch(s, `error: bad key ${KEY} <script>`, true));
      const reason = (r as { reason: string }).reason;
      expect(reason).not.toContain(KEY);
      expect(reason.length).toBeLessThanOrEqual(120);
    }
  });
  it("sanitizes the display name and subject", async () => {
    const f = mockFetch(okStatus[cfg.provider]!, okBody(cfg.provider));
    await send(cfg, f, { ...mail, from: { name: 'Ev"il\r\nBcc: x <a@b.c>', address: "support@acme.test" }, subject: "Hi\r\nBcc: x" });
    const body = call(f).init.body as string;
    const decoded = decodeURIComponent(body.replace(/\+/g, " "));
    expect(decoded).not.toMatch(/[\r\n]/);
    expect(body).not.toContain("\\r");
    expect(body).not.toContain("\\n");
    expect(decoded).not.toContain("<a@b.c>");
    expect(decoded).not.toContain('Ev"il');
  });
  it("rejects a malformed recipient without calling the provider", async () => {
    const f = mockFetch(okStatus[cfg.provider]!);
    const r = await send(cfg, f, { ...mail, to: "a@b.test\r\nBcc: x@y.test" });
    expect(r).toMatchObject({ ok: false, retryable: false });
    expect(f).not.toHaveBeenCalled();
  });
});
