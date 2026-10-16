import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake Redis that honors TTLs against the (fake) clock and records every key's TTL.
const store = new Map<string, { v: number; exp: number | null; ttl: number | null }>();
const live = (k: string) => {
  const e = store.get(k);
  if (e && e.exp !== null && e.exp <= Date.now()) store.delete(k);
  return store.get(k);
};
vi.mock("../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: number | string, _ex: string, ttl: number) => {
      store.set(k, { v: Number(v), exp: Date.now() + ttl * 1000, ttl });
      return "OK";
    }),
    eval: vi.fn(async (_script: string, _n: number, key: string, ttl: string, refresh: string) => {
      const e = live(key) ?? { v: 0, exp: null, ttl: null };
      e.v += 1;
      if (e.v === 1 || refresh === "1") {
        e.exp = Date.now() + Number(ttl) * 1000;
        e.ttl = Number(ttl);
      }
      store.set(key, e);
      return e.v;
    }),
    exists: vi.fn(async (k: string) => (live(k) ? 1 : 0)),
    del: vi.fn(async (...ks: string[]) => {
      ks.forEach((k) => store.delete(k));
      return ks.length;
    }),
  },
}));

import { clearPasswordFailures, isLocked, recordPasswordFailure } from "./limits.js";

const fail = async (id: string, n: number) => {
  for (let i = 0; i < n; i++) await recordPasswordFailure(id);
};

describe("password lockout", () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks 900s on the 5th failure; after expiry 5 more give 1800s, then doubling to the 24h cap", async () => {
    await fail("a1", 4);
    expect(await isLocked("a1")).toBe(false);
    await fail("a1", 1);
    expect(await isLocked("a1")).toBe(true);
    expect(store.get("auth:lock:a1")!.ttl).toBe(900);

    vi.advanceTimersByTime(901_000);
    expect(await isLocked("a1")).toBe(false);
    await fail("a1", 5);
    expect(store.get("auth:lock:a1")!.ttl).toBe(1800);

    let last = 1800;
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime((last + 1) * 1000);
      await fail("a1", 5);
      last = store.get("auth:lock:a1")!.ttl!;
    }
    expect(last).toBe(86400);
  });

  it("every counter key carries a TTL", async () => {
    await fail("a1", 5);
    for (const k of ["auth:pwstrikes:a1", "auth:lock:a1"]) expect(store.get(k)!.ttl).toBeGreaterThan(0);
    await fail("a2", 2);
    expect(store.get("auth:pwfail:a2")!.ttl).toBe(900);
  });

  it("is per account; success clears failures, strikes and lock", async () => {
    await fail("a1", 5);
    expect(await isLocked("a2")).toBe(false);
    await clearPasswordFailures("a1");
    expect(await isLocked("a1")).toBe(false);
    expect(store.has("auth:pwfail:a1")).toBe(false);
    expect(store.has("auth:pwstrikes:a1")).toBe(false);
  });
});
