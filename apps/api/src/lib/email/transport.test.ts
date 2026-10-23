import { describe, expect, it } from "vitest";
import { HTTP_PROVIDERS, redactConfig, validateProviderConfig } from "./transport.js";

const KEY = "test-key-123";

describe("validateProviderConfig", () => {
  it("lists the six HTTP providers", () => {
    expect([...HTTP_PROVIDERS]).toEqual(["sendgrid", "mailgun", "postmark", "resend", "brevo", "sparkpost"]);
  });

  it.each(["sendgrid", "resend", "postmark", "brevo", "sparkpost"])("accepts a valid %s config", (p) => {
    const r = validateProviderConfig(p, { apiKey: KEY });
    expect(r).toEqual({ ok: true, config: { provider: p, apiKey: KEY } });
  });

  it("keeps region only for providers that have an EU host", () => {
    expect(validateProviderConfig("sendgrid", { apiKey: KEY, region: "eu" })).toEqual({
      ok: true,
      config: { provider: "sendgrid", apiKey: KEY, region: "eu" },
    });
    expect(validateProviderConfig("sparkpost", { apiKey: KEY, region: "us" })).toEqual({
      ok: true,
      config: { provider: "sparkpost", apiKey: KEY, region: "us" },
    });
    expect(validateProviderConfig("resend", { apiKey: KEY, region: "eu" })).toEqual({
      ok: true,
      config: { provider: "resend", apiKey: KEY },
    });
  });

  it("rejects an unknown region", () => {
    const r = validateProviderConfig("sendgrid", { apiKey: KEY, region: "asia" });
    expect(r).toMatchObject({ ok: false, field: "region" });
  });

  it("validates mailgun with domain, defaulting region to us and lowercasing the domain", () => {
    expect(validateProviderConfig("mailgun", { apiKey: KEY, domain: "Mg.Example.com" })).toEqual({
      ok: true,
      config: { provider: "mailgun", apiKey: KEY, domain: "mg.example.com", region: "us" },
    });
    expect(validateProviderConfig("mailgun", { apiKey: KEY, domain: "mg.example.com", region: "eu" })).toMatchObject({
      ok: true,
      config: { region: "eu" },
    });
  });

  it.each(["", "localhost", "a/b.com", "a.com/../x", "a.com?x=1", "a b.com", "-a.com", "a-.com", "a..com", "a.com:8080", "user@a.com", "a.com#x", "a.com\n"])(
    "rejects bad mailgun domain %j",
    (domain) => {
      expect(validateProviderConfig("mailgun", { apiKey: KEY, domain })).toMatchObject({ ok: false, field: "domain" });
    },
  );

  it("rejects a missing mailgun domain", () => {
    expect(validateProviderConfig("mailgun", { apiKey: KEY })).toMatchObject({ ok: false, field: "domain" });
  });

  it.each([
    ["missing", undefined],
    ["non-string", 12345678],
    ["too short", "short"],
    ["too long", "k".repeat(513)],
    ["with space", "test key 123"],
    ["with newline", "test-key\n123"],
    ["with control char", "test-key\u0007123"],
    ["non-Latin1", "test-key-ЖЖЖЖ"],
    ["with an accent", "test-key-café-123"],
  ])("rejects an apiKey that is %s", (_n, apiKey) => {
    expect(validateProviderConfig("resend", { apiKey })).toMatchObject({ ok: false, field: "apiKey" });
  });

  it("accepts key boundary lengths 8 and 512", () => {
    expect(validateProviderConfig("resend", { apiKey: "k".repeat(8) }).ok).toBe(true);
    expect(validateProviderConfig("resend", { apiKey: "k".repeat(512) }).ok).toBe(true);
    expect(validateProviderConfig("resend", { apiKey: "k".repeat(7) }).ok).toBe(false);
  });

  it("rejects unknown providers and non-object input", () => {
    expect(validateProviderConfig("mailchimp", { apiKey: KEY })).toMatchObject({ ok: false, field: "provider" });
    expect(validateProviderConfig("resend", null)).toMatchObject({ ok: false });
    expect(validateProviderConfig("resend", "x")).toMatchObject({ ok: false });
  });

  it("drops extra fields", () => {
    const r = validateProviderConfig("postmark", { apiKey: KEY, host: "evil.example", url: "http://x", extra: 1 });
    expect(r).toEqual({ ok: true, config: { provider: "postmark", apiKey: KEY } });
  });

  it("never echoes the key in error messages", () => {
    const r = validateProviderConfig("resend", { apiKey: "has space in it" });
    expect(JSON.stringify(r)).not.toContain("has space");
  });
});

describe("redactConfig", () => {
  it("replaces the apiKey and keeps the rest", () => {
    const out = redactConfig({ provider: "mailgun", apiKey: KEY, domain: "mg.example.com", region: "eu" });
    expect(out).toEqual({ provider: "mailgun", apiKey: "***", domain: "mg.example.com", region: "eu" });
    expect(JSON.stringify(out)).not.toContain(KEY);
  });
});
