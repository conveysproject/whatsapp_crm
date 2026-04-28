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
});
