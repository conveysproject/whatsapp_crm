import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = new Map<string, number>();
vi.mock("../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: number, _ex: string, _s: number, _nx: string) => {
      if (!counts.has(k)) counts.set(k, v);
      return "OK";
    }),
    incr: vi.fn(async (k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k)!;
    }),
  },
}));

import { authClientIp, hitLimit } from "./limits.js";
import { redis } from "../lib/redis.js";

describe("hitLimit", () => {
  beforeEach(() => {
    counts.clear();
    vi.clearAllMocks();
  });

  it("allows up to max then reports over limit", async () => {
    for (let i = 0; i < 3; i++) expect(await hitLimit("k", 3, 60)).toBe(false);
    expect(await hitLimit("k", 3, 60)).toBe(true);
  });

  it("sets the TTL atomically on first hit (SET EX NX before INCR)", async () => {
    await hitLimit("k2", 3, 60);
    expect(redis.set).toHaveBeenCalledWith("k2", 0, "EX", 60, "NX");
    const setOrder = (redis.set as any).mock.invocationCallOrder[0];
    const incrOrder = (redis.incr as any).mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(incrOrder);
  });

  it("keys are independent", async () => {
    await hitLimit("a", 1, 60);
    expect(await hitLimit("b", 1, 60)).toBe(false);
  });
});

describe("authClientIp", () => {
  const SECRET = "s".repeat(40);
  const req = (headers: Record<string, string>, ip = "8.8.8.8") => ({ ip, headers }) as any;
  beforeEach(() => {
    process.env["AUTH_BFF_SECRET"] = SECRET;
  });

  it("uses x-wbmsg-client-ip when the BFF secret matches", () => {
    expect(authClientIp(req({ "x-wbmsg-bff": SECRET, "x-wbmsg-client-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores the header with a wrong or missing secret", () => {
    expect(authClientIp(req({ "x-wbmsg-bff": "x".repeat(40), "x-wbmsg-client-ip": "203.0.113.9" }))).toBe("8.8.8.8");
    expect(authClientIp(req({ "x-wbmsg-client-ip": "203.0.113.9" }))).toBe("8.8.8.8");
  });

  it("ignores a non-IP value", () => {
    expect(authClientIp(req({ "x-wbmsg-bff": SECRET, "x-wbmsg-client-ip": "not-an-ip" }))).toBe("8.8.8.8");
  });

  it("ignores everything when the env secret is shorter than 32 chars", () => {
    process.env["AUTH_BFF_SECRET"] = "short";
    expect(authClientIp(req({ "x-wbmsg-bff": "short", "x-wbmsg-client-ip": "203.0.113.9" }))).toBe("8.8.8.8");
  });

  it("falls back to proxy-aware forwarded-for behind a private peer", () => {
    delete process.env["AUTH_BFF_SECRET"];
    expect(authClientIp(req({ "x-forwarded-for": "1.2.3.4" }, "100.64.0.5"))).toBe("1.2.3.4");
  });
});
