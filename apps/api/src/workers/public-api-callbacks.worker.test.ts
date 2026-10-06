import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as SafeUrlModule from "../lib/public-api/safe-url.js";

const { prisma, checkAccess } = vi.hoisted(() => ({ prisma: { apiKey: { findUnique: vi.fn() } }, checkAccess: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("../lib/public-api/access.js", () => ({ checkPublicApiAccess: (...a: unknown[]) => checkAccess(...a) }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/public-api/queues.js", () => ({ publicApiCallbackQueue: {}, publicApiSendQueue: {} }));
vi.mock("../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof SafeUrlModule>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("internal")) throw new real.UnsafeUrlError("private"); return new URL(u); }) };
});

import { deliverCallback, callbackBackoff, onCallbackJobFailed } from "./public-api-callbacks.worker.js";
import { encryptToken } from "../lib/public-api/credentials.js";
import { signV2 } from "../lib/public-api/plivo-signature.js";
import { UnrecoverableError } from "bullmq";

const data = (over: Record<string, unknown> = {}) => ({ data: { apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/hook", method: "POST", fields: { MessageUUID: "m1", Status: "sent" }, ...over } }) as never;

describe("deliverCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 5).toString("base64");
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("secret-token"), revokedAt: null, organizationId: "org-1" });
    checkAccess.mockResolvedValue({ allowed: true });
  });

  it.each(["blocked", "not_allowed"] as const)("access %s: throws UnrecoverableError (no retries, no secrets in the message) and never fetches", async (reason) => {
    checkAccess.mockResolvedValue({ allowed: false, reason });
    const fetchMock = vi.fn();
    const err = await deliverCallback(data(), fetchMock as unknown as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect((err as Error).message).toBe("access disabled");
    expect(checkAccess).toHaveBeenCalledWith(prisma, "org-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed: a thrown access lookup propagates (retried) and nothing is fetched", async () => {
    checkAccess.mockRejectedValue(new Error("db down"));
    const fetchMock = vi.fn();
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toThrow("db down");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs form-encoded fields with a valid V2 signature, nonce and no redirect following", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await deliverCallback(data(), fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://c.example.com/hook");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toBe("MessageUUID=m1&Status=sent");
    const nonce = init.headers["X-Plivo-Signature-V2-Nonce"]!;
    expect(init.headers["X-Plivo-Signature-V2"]).toBe(signV2("https://c.example.com/hook", nonce, "secret-token"));
    expect(init.headers["X-Plivo-Signature-Ma-V2"]).toBe(init.headers["X-Plivo-Signature-V2"]);
  });

  it("GET callbacks carry fields in the query string and sign the URL without it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await deliverCallback(data({ method: "GET" }), fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://c.example.com/hook?MessageUUID=m1&Status=sent");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Plivo-Signature-V2"]).toBe(signV2("https://c.example.com/hook", init.headers["X-Plivo-Signature-V2-Nonce"]!, "secret-token"));
  });

  it("throws (so BullMQ retries) on non-2xx, including redirects", async () => {
    for (const status of [500, 302, 404]) {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
      await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toThrow(`HTTP ${status}`);
    }
  });

  it("does not retry (UnrecoverableError) for unsafe URLs, revoked or token-less credentials, and never fetches", async () => {
    const fetchMock = vi.fn();
    await expect(deliverCallback(data({ url: "https://internal.example.com/h" }), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("t"), revokedAt: new Date(), organizationId: "org-1" });
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: null, revokedAt: null, organizationId: "org-1" });
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    prisma.apiKey.findUnique.mockResolvedValue(null);
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks the credential up with the org it was queued for", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("s"), revokedAt: null, organizationId: "org-OTHER" });
    const fetchMock = vi.fn();
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("deliverCallback hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkAccess.mockResolvedValue({ allowed: true });
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 5).toString("base64");
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("secret-token"), revokedAt: null, organizationId: "org-1" });
  });

  it("S3: drains (cancels) the response body on success and on failure", async () => {
    for (const [ok, status] of [[true, 200], [false, 500]] as const) {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const fetchMock = vi.fn().mockResolvedValue({ ok, status, body: { cancel } });
      await deliverCallback(data(), fetchMock as unknown as typeof fetch).catch(() => undefined);
      expect(cancel).toHaveBeenCalledTimes(1);
    }
  });

  it("S3: a body cancel that rejects does not fail a 2xx delivery", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: { cancel: vi.fn().mockRejectedValue(new Error("x")) } });
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).resolves.toBeUndefined();
  });

  it("S3: a token that cannot be decrypted is not retried (UnrecoverableError, no secret in the message) and never fetches", async () => {
    const fetchMock = vi.fn();
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: "garbage", revokedAt: null, organizationId: "org-1" });
    const err = await deliverCallback(data(), fetchMock as unknown as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect((err as Error).message).not.toContain("garbage");
    delete process.env["PUBLIC_API_TOKEN_KEY"];
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: "a.b.c", revokedAt: null, organizationId: "org-1" });
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("S4: the failed-job log carries no phone number or message text", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new Error("callback for 14155552672 said: secret body text");
    onCallbackJobFailed({ id: "j1", attemptsMade: 1 } as never, err);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("j1");
    expect(logged).not.toContain("14155552672");
    expect(logged).not.toContain("secret");
    spy.mockRestore();
  });
});

describe("callbackBackoff", () => {
  it("is 60s, 120s, 240s for the three retries", () => {
    expect([1, 2, 3].map(callbackBackoff)).toEqual([60000, 120000, 240000]);
  });
});
