import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_NO_TURNSTILE_LIMIT, passesBotCheck, verifyTurnstile } from "./turnstile.js";

describe("verifyTurnstile", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("returns true without fetch when the secret is unset", async () => {
    expect(await verifyTurnstile(undefined, "1.1.1.1")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false without fetch for a missing or empty token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    expect(await verifyTurnstile(undefined, "1.1.1.1")).toBe(false);
    expect(await verifyTurnstile("", "1.1.1.1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the form and maps success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    expect(await verifyTurnstile("tok", "1.1.1.1")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    const p = new URLSearchParams(init.body as string);
    expect(p.get("secret")).toBe("s");
    expect(p.get("response")).toBe("tok");
    expect(p.get("remoteip")).toBe("1.1.1.1");
    expect(init.signal).toBeDefined();
  });

  it("maps success:false, non-ok and network errors to false", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) });
    expect(await verifyTurnstile("tok", "1.1.1.1")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: true }) });
    expect(await verifyTurnstile("tok", "1.1.1.1")).toBe(false);
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await verifyTurnstile("tok", "1.1.1.1")).toBe(false);
  });
});

describe("passesBotCheck (mobile bypass)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TURNSTILE_SECRET_KEY = "secret";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("passes without any check when Turnstile is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const hit = vi.fn();
    expect(await passesBotCheck({}, undefined, "1.2.3.4", hit)).toBe(true);
    expect(hit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mobile requests skip Turnstile but use the stricter per-IP limit", async () => {
    const hit = vi.fn().mockResolvedValue(false);
    expect(await passesBotCheck({ "x-app-client": "Mobile" }, undefined, "1.2.3.4", hit)).toBe(true);
    expect(hit).toHaveBeenCalledWith("auth:mobile-no-turnstile:1.2.3.4", MOBILE_NO_TURNSTILE_LIMIT.max, MOBILE_NO_TURNSTILE_LIMIT.windowSec);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mobile requests over the limit fail the check", async () => {
    const hit = vi.fn().mockResolvedValue(true);
    expect(await passesBotCheck({ "x-app-client": "mobile" }, undefined, "1.2.3.4", hit)).toBe(false);
  });

  it("web requests still need a valid Turnstile token", async () => {
    const hit = vi.fn();
    expect(await passesBotCheck({}, undefined, "1.2.3.4", hit)).toBe(false);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await passesBotCheck({ "x-app-client": "web" }, "tok", "1.2.3.4", hit)).toBe(true);
    expect(hit).not.toHaveBeenCalled();
  });
});
