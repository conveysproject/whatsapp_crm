import { describe, it, expect, afterEach } from "vitest";
import { buildPayloadSnapshot, capText, payloadLoggingEnabled, payloadSize, redactValue, stripUnsafeText } from "./payload-capture.js";

describe("redactValue", () => {
  it("redacts secret-looking keys at any depth and keeps normal fields", () => {
    const out = redactValue({ text: "hi", auth_token: "abc", nested: { Authorization: "Basic x", password: "p", keep: 1 }, list: [{ apiKey: "k" }] });
    expect(out).toEqual({ text: "hi", auth_token: "[redacted]", nested: { Authorization: "[redacted]", password: "[redacted]", keep: 1 }, list: [{ apiKey: "[redacted]" }] });
  });
  it("strips query strings from URL values", () => {
    expect(redactValue({ media_urls: ["https://cdn.example.com/a.png?sig=SECRET&x=1"] })).toEqual({ media_urls: ["https://cdn.example.com/a.png?[redacted]"] });
  });
  it("strips URL userinfo and matches the scheme case-insensitively", () => {
    expect(redactValue({ url: "https://user:pw@host/cb" })).toEqual({ url: "https://[redacted]@host/cb" });
    expect(redactValue({ url: "https://user:pw@host/cb?token=1" })).toEqual({ url: "https://[redacted]@host/cb?[redacted]" });
    expect(redactValue({ url: "HTTPS://x/a?sig=SECRET" })).toEqual({ url: "HTTPS://x/a?[redacted]" });
  });
  it("leaves a string that merely contains a URL mid-text as is (customer content)", () => {
    const t = "see https://user:pw@host/cb?sig=SECRET for details";
    expect(redactValue({ text: t })).toEqual({ text: t });
  });
  it("bounds depth and array size", () => {
    const deep: Record<string, unknown> = {}; let cur = deep;
    for (let i = 0; i < 20; i++) { const n = {}; cur["a"] = n; cur = n as Record<string, unknown>; }
    expect(JSON.stringify(redactValue(deep))).toContain("[too deep]");
    expect((redactValue(Array.from({ length: 500 }, (_, i) => i)) as unknown[]).length).toBe(200);
  });
});

describe("capText", () => {
  it("leaves short text and cuts long text with a flag", () => {
    expect(capText("abc", 10)).toEqual({ text: "abc", truncated: false });
    expect(capText("a".repeat(20), 10)).toEqual({ text: "a".repeat(10), truncated: true });
  });
});

describe("buildPayloadSnapshot", () => {
  const base = { url: "/v1/Account/AUTHID/Message/?limit=5&token=zzz", clientIp: "203.0.113.9", userAgent: "curl/8" };
  it("stores redacted JSON for body and response, the error_code and a redacted query string", () => {
    const s = buildPayloadSnapshot({ ...base, body: { dst: "1", auth_token: "t" }, responseText: JSON.stringify({ api_id: "x", error: "bad", error_code: "VALIDATION_FAILED" }) });
    expect(s.requestBody).toBe(JSON.stringify({ dst: "1", auth_token: "[redacted]" }));
    expect(s.errorCode).toBe("VALIDATION_FAILED");
    expect(s.queryString).toBe("limit=5&token=[redacted]");
    expect(s.userAgent).toBe("curl/8");
  });
  it("a 17 KB body is truncated and flagged; a missing body is null", () => {
    const s = buildPayloadSnapshot({ ...base, body: { parts: Array.from({ length: 20 }, () => "x".repeat(1000)) }, responseText: undefined });
    expect(s.requestBody!.length).toBe(16384);
    expect(s.requestTruncated).toBe(true);
    expect(s.responseBody).toBeNull();
    expect(buildPayloadSnapshot({ ...base, body: undefined, responseText: undefined }).requestBody).toBeNull();
  });
  it("keeps a non-JSON response as redacted-agnostic text, capped", () => {
    expect(buildPayloadSnapshot({ ...base, body: undefined, responseText: "plain" }).responseBody).toBe("plain");
  });
  it("payloadSize counts both bodies", () => {
    const s = buildPayloadSnapshot({ ...base, body: { a: 1 }, responseText: "xy" });
    expect(payloadSize(s)).toBeGreaterThanOrEqual(s.requestBody!.length + 2);
  });
});

describe("payloadLoggingEnabled", () => {
  const prev = process.env["API_PAYLOAD_LOGGING_ENABLED"];
  afterEach(() => { if (prev === undefined) delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; else process.env["API_PAYLOAD_LOGGING_ENABLED"] = prev; });
  it("is off unless exactly 'true'", () => {
    delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; expect(payloadLoggingEnabled()).toBe(false);
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "1"; expect(payloadLoggingEnabled()).toBe(false);
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true"; expect(payloadLoggingEnabled()).toBe(true);
  });
});

describe("privacy extras", () => {
  it("redacts every secret-looking key name at depth, including inside arrays", () => {
    const keys = ["authorization", "Authorization", "auth_token", "apiKey", "api-key", "client_secret", "password"];
    for (const k of keys) {
      const out = redactValue({ a: { b: [{ c: { [k]: "SECRET", ok: "fine" } }] } }) as { a: { b: Array<{ c: Record<string, unknown> }> } };
      expect(out.a.b[0]!.c[k]).toBe("[redacted]");
      expect(out.a.b[0]!.c["ok"]).toBe("fine");
    }
  });
  it("cuts media URL queries but keeps URLs without one", () => {
    expect(redactValue({ media: "https://x.test/a.png?sig=S" })).toEqual({ media: "https://x.test/a.png?[redacted]" });
    expect(redactValue({ media: "https://x.test/a.png" })).toEqual({ media: "https://x.test/a.png" });
  });
  it("truncates strings longer than 2000 chars", () => {
    const s = redactValue("a".repeat(2500)) as string;
    expect(s.length).toBeLessThan(2500);
    expect(s.startsWith("a".repeat(2000))).toBe(true);
  });
  it("replaces objects nested deeper than 8 levels with [too deep]", () => {
    let o: unknown = "leaf";
    for (let i = 0; i < 12; i++) o = { n: o };
    expect(JSON.stringify(redactValue(o))).toContain("[too deep]");
  });
  it("redacts token= in the query string", () => {
    const s = buildPayloadSnapshot({ body: undefined, url: "/x?token=abc&Api-Key=k&q=1", responseText: undefined, clientIp: null, userAgent: undefined });
    expect(s.queryString).toBe("token=[redacted]&Api-Key=[redacted]&q=1");
  });
  it("does not throw on a circular body", () => {
    const body: Record<string, unknown> = { a: 1 };
    body["self"] = body;
    expect(() => buildPayloadSnapshot({ body, url: "/x", responseText: undefined, clientIp: null, userAgent: undefined })).not.toThrow();
  });
  it("stores null (not truncated) when the body cannot be stringified", () => {
    const s = buildPayloadSnapshot({ body: { n: BigInt(1) }, url: "/x", responseText: undefined, clientIp: null, userAgent: undefined });
    expect(s.requestBody).toBeNull();
    expect(s.requestTruncated).toBe(false);
  });
});

describe("stripUnsafeText", () => {
  it("removes NUL, keeps a valid surrogate pair, removes lone surrogates", () => {
    expect(stripUnsafeText("a\u0000b")).toBe("ab");
    expect(stripUnsafeText("x\u{1F600}y")).toBe("x\u{1F600}y");
    expect(stripUnsafeText("a\uD83Db")).toBe("ab");
    expect(stripUnsafeText("a\uDE00b")).toBe("ab");
    expect(stripUnsafeText("\uD83D")).toBe("");
  });
  it("capText cannot leave a lone surrogate at the cut", () => {
    expect(capText("ab\u{1F600}cd", 3)).toEqual({ text: "ab", truncated: true });
  });
  it("is applied to every snapshot string (response text, user agent, ip, query, error code)", () => {
    const snap = buildPayloadSnapshot({ body: undefined, url: "/x?q=a%00b", responseText: "bad\u0000text\uD83D", clientIp: "1.2\u0000.3.4", userAgent: "u\u0000a\uDE00" });
    expect(snap.responseBody).toBe("badtext");
    expect(snap.userAgent).toBe("ua");
    expect(snap.clientIp).toBe("1.2.3.4");
    const withCode = buildPayloadSnapshot({ body: null, url: "/x", responseText: JSON.stringify({ error_code: "E\u0000X" }), clientIp: null, userAgent: undefined });
    expect(withCode.errorCode).toBe("EX");
  });
});
