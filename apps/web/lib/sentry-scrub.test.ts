import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("drops the request body and secrets for /api/internal/* requests", () => {
    const e = scrubSentryEvent({
      request: {
        url: "https://app.example.com/api/internal/send-email",
        data: { to: "a@b.co", smtp: { pass: "test-pass-123" } },
        cookies: { a: "b" },
        headers: { Authorization: "Bearer test-secret", "content-type": "application/json" },
      },
    });
    expect(e.request).not.toHaveProperty("data");
    expect(e.request).not.toHaveProperty("cookies");
    expect(e.request?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.stringify(e)).not.toContain("test-pass-123");
  });
  it("redacts sensitive keys anywhere in extra, contexts and breadcrumbs", () => {
    const e = scrubSentryEvent({
      request: { url: "https://app.example.com/other", data: { keep: 1, password: "test-pass-123" } },
      extra: { smtp: { host: "h", pass: "test-pass-123" }, nested: [{ apiKey: "test-key-123" }], ok: "fine" },
      contexts: { c: { PASS: "test-pass-123", name: "x" } },
      breadcrumbs: [{ data: { Authorization: "Bearer test-secret" } }],
    });
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/test-pass-123|test-key-123|test-secret/);
    expect(e.extra).toMatchObject({ smtp: "[Filtered]", ok: "fine" });
    expect((e.request?.data as { keep: number }).keep).toBe(1);
  });
  it("survives cycles and events without a request", () => {
    const a: Record<string, unknown> = { x: 1 };
    a["self"] = a;
    expect(() => scrubSentryEvent({ extra: a })).not.toThrow();
    expect(scrubSentryEvent({})).toEqual({});
  });
  it("does not treat a similar path as internal", () => {
    const e = scrubSentryEvent({ request: { url: "https://x.test/api/internals", data: { a: 1 } } });
    expect(e.request?.data).toEqual({ a: 1 });
  });
});
