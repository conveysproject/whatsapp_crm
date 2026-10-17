import { describe, it, expect, vi } from "vitest";
import { createTokenStore } from "./token-store";

const NOW = 1_000_000;
const tok = (t: string, ttlMs = 600_000) => ({ accessToken: t, expiresAt: NOW + ttlMs });

describe("createTokenStore", () => {
  it("caches until 30s before expiry", async () => {
    let now = NOW;
    const fetchToken = vi.fn().mockResolvedValueOnce(tok("a")).mockResolvedValueOnce(tok("b"));
    const s = createTokenStore(fetchToken, () => now);
    expect(await s.getToken()).toBe("a");
    now = NOW + 560_000;
    expect(await s.getToken()).toBe("a");
    now = NOW + 570_001;
    expect(await s.getToken()).toBe("b");
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent calls", async () => {
    const fetchToken = vi.fn().mockResolvedValue(tok("a"));
    const s = createTokenStore(fetchToken, () => NOW);
    const [x, y] = await Promise.all([s.getToken(), s.getToken()]);
    expect([x, y]).toEqual(["a", "a"]);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it("returns null on a 401 and re-fetches next time", async () => {
    let now = NOW;
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: null, expiresAt: null })
      .mockResolvedValueOnce(tok("a"));
    const s = createTokenStore(fetchToken, () => now);
    expect(await s.getToken()).toBeNull();
    now = NOW + 5_001;
    expect(await s.getToken()).toBe("a");
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it("returns null after clear() without fetching", async () => {
    const fetchToken = vi.fn().mockResolvedValue(tok("a"));
    const s = createTokenStore(fetchToken, () => NOW);
    await s.getToken();
    s.clear();
    expect(await s.getToken()).toBeNull();
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it("on a transient failure returns the still-valid cached token, else null", async () => {
    let now = NOW;
    const fetchToken = vi.fn().mockResolvedValueOnce(tok("a")).mockRejectedValue(new Error("503"));
    const s = createTokenStore(fetchToken, () => now);
    await s.getToken();
    now = NOW + 580_000; // inside the refresh window but not expired
    expect(await s.getToken()).toBe("a");
    now = NOW + 700_000;
    expect(await s.getToken()).toBeNull();
  });
});

describe("createTokenStore status", () => {
  it("503 first load is unknown, never signed_out", async () => {
    const s = createTokenStore(vi.fn().mockRejectedValue(new Error("503")), () => NOW);
    expect(await s.getToken()).toBeNull();
    expect(s.status()).toBe("unknown");
  });
  it("401 is signed_out, negative-cached for 5s, then refetches", async () => {
    let now = NOW;
    const f = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: null, expiresAt: null })
      .mockResolvedValueOnce({ ...tok("a"), userId: "u1" });
    const s = createTokenStore(f, () => now);
    await s.getToken();
    expect(s.status()).toBe("signed_out");
    await s.getToken();
    expect(f).toHaveBeenCalledTimes(1);
    now = NOW + 5_001;
    expect(await s.getToken()).toBe("a");
    expect(f).toHaveBeenCalledTimes(2);
    expect(s.status()).toBe("signed_in");
    expect(s.userId()).toBe("u1");
  });
  it("503 with a valid cached token stays signed_in", async () => {
    let now = NOW;
    const f = vi.fn().mockResolvedValueOnce(tok("a")).mockRejectedValue(new Error("x"));
    const s = createTokenStore(f, () => now);
    await s.getToken();
    now = NOW + 580_000;
    await s.getToken();
    expect(s.status()).toBe("signed_in");
  });
  it("clear() makes status signed_out", () => {
    const s = createTokenStore(vi.fn(), () => NOW);
    s.clear();
    expect(s.status()).toBe("signed_out");
  });
});
