import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({ prisma: { apiKey: { findUnique: vi.fn() } } }));
vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/public-api/queues.js", () => ({ publicApiCallbackQueue: {}, publicApiSendQueue: {} }));
vi.mock("../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof import("../lib/public-api/safe-url.js")>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("internal")) throw new real.UnsafeUrlError("private"); return new URL(u); }) };
});

import { deliverCallback, callbackBackoff } from "./public-api-callbacks.worker.js";
import { encryptToken } from "../lib/public-api/credentials.js";
import { signV2 } from "../lib/public-api/plivo-signature.js";
import { UnrecoverableError } from "bullmq";

const data = (over: Record<string, unknown> = {}) => ({ data: { apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/hook", method: "POST", fields: { MessageUUID: "m1", Status: "sent" }, ...over } }) as never;

describe("deliverCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 5).toString("base64");
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("secret-token"), revokedAt: null, organizationId: "org-1" });
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

describe("callbackBackoff", () => {
  it("is 60s, 120s, 240s for the three retries", () => {
    expect([1, 2, 3].map(callbackBackoff)).toEqual([60000, 120000, 240000]);
  });
});
