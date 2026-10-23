import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe("sentry plugin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("registers without error when SENTRY_DSN is set", async () => {
    process.env["SENTRY_DSN"] = "https://test@sentry.io/123";
    const { sentryPlugin } = await import("./sentry.js");
    const app = Fastify({ logger: false });
    await expect(app.register(sentryPlugin)).resolves.not.toThrow();
    await app.close();
  });

  it("skips init when SENTRY_DSN is not set", async () => {
    delete process.env["SENTRY_DSN"];
    const Sentry = await import("@sentry/node");
    const { sentryPlugin } = await import("./sentry.js");
    const app = Fastify({ logger: false });
    await app.register(sentryPlugin);
    expect(Sentry.init).not.toHaveBeenCalled();
    await app.close();
  });

  it("scrubs request bodies, cookies and auth headers from events", async () => {
    const { scrubSentryEvent } = await import("./sentry.js");
    const event = {
      message: "boom",
      request: {
        url: "/v1/organizations/email-settings",
        data: { pass: "test-secret" },
        cookies: { sid: "test-cookie" },
        headers: { Authorization: "Bearer test-token", cookie: "sid=test-cookie", accept: "application/json" },
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.request).not.toHaveProperty("data");
    expect(out.request).not.toHaveProperty("cookies");
    expect(out.request?.headers).toEqual({ accept: "application/json" });
    expect(JSON.stringify(out)).not.toContain("test-secret");
    expect(JSON.stringify(out)).not.toContain("test-token");
  });

  it("wires the scrub into beforeSend and beforeSendTransaction", async () => {
    process.env["SENTRY_DSN"] = "https://test@sentry.io/123";
    const Sentry = await import("@sentry/node");
    const { sentryPlugin } = await import("./sentry.js");
    const app = Fastify({ logger: false });
    await app.register(sentryPlugin);
    const opts = vi.mocked(Sentry.init).mock.calls[0]![0] as unknown as {
      sendDefaultPii?: boolean;
      beforeSend: (e: unknown) => { request?: { data?: unknown } };
      beforeSendTransaction: (e: unknown) => { request?: { data?: unknown } };
    };
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.beforeSend({ request: { data: { pass: "test-secret" } } }).request).not.toHaveProperty("data");
    expect(opts.beforeSendTransaction({ request: { data: { pass: "test-secret" } } }).request).not.toHaveProperty("data");
    await app.close();
  });
});
