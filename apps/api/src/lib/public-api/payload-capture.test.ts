import { describe, it, expect, afterEach } from "vitest";
import { buildPayloadSnapshot, capText, payloadLoggingEnabled, payloadSize, redactValue } from "./payload-capture.js";

describe("redactValue", () => {
  it("redacts secret-looking keys at any depth and keeps normal fields", () => {
    const out = redactValue({ text: "hi", auth_token: "abc", nested: { Authorization: "Basic x", password: "p", keep: 1 }, list: [{ apiKey: "k" }] });
    expect(out).toEqual({ text: "hi", auth_token: "[redacted]", nested: { Authorization: "[redacted]", password: "[redacted]", keep: 1 }, list: [{ apiKey: "[redacted]" }] });
  });
  it("strips query strings from URL values", () => {
    expect(redactValue({ media_urls: ["https://cdn.example.com/a.png?sig=SECRET&x=1"] })).toEqual({ media_urls: ["https://cdn.example.com/a.png?[redacted]"] });
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
