import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { v: number; ttl: number }>();
vi.mock("../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: number | string, _ex: string, ttl: number, nx?: string) => {
      if (nx === "NX" && store.has(k)) return null;
      store.set(k, { v: Number(v), ttl });
      return "OK";
    }),
    incr: vi.fn(async (k: string) => {
      const e = store.get(k)!;
      e.v += 1;
      return e.v;
    }),
    exists: vi.fn(async (k: string) => (store.has(k) ? 1 : 0)),
    del: vi.fn(async (...ks: string[]) => {
      ks.forEach((k) => store.delete(k));
      return ks.length;
    }),
  },
}));

import { clearPasswordFailures, isLocked, recordPasswordFailure } from "./limits.js";

describe("password lockout", () => {
  beforeEach(() => store.clear());

  it("locks on the 5th failure for 900s, doubling each further failure, capped at 24h", async () => {
    for (let i = 0; i < 4; i++) await recordPasswordFailure("a1");
    expect(await isLocked("a1")).toBe(false);
    await recordPasswordFailure("a1");
    expect(await isLocked("a1")).toBe(true);
    expect(store.get("auth:lock:a1")!.ttl).toBe(900);
    await recordPasswordFailure("a1");
    expect(store.get("auth:lock:a1")!.ttl).toBe(1800);
    for (let i = 0; i < 20; i++) await recordPasswordFailure("a1");
    expect(store.get("auth:lock:a1")!.ttl).toBe(86400);
  });

  it("is per account and cleared on success", async () => {
    for (let i = 0; i < 5; i++) await recordPasswordFailure("a1");
    expect(await isLocked("a2")).toBe(false);
    await clearPasswordFailures("a1");
    expect(await isLocked("a1")).toBe(false);
    expect(store.has("auth:pwfail:a1")).toBe(false);
  });
});
