import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const store = vi.hoisted(() => new Map<string, string>());
const ttl = vi.hoisted(() => new Map<string, number>());
vi.mock("../../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string, _ex: string, t: number) => {
      store.set(k, v);
      ttl.set(k, t);
      return "OK";
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    getdel: vi.fn(async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    }),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  },
}));

import {
  consumeOAuthState,
  deletePendingOAuth,
  loadPendingOAuth,
  newOpaqueId,
  pkceChallenge,
  safeRelativePath,
  saveOAuthState,
  savePendingOAuth,
} from "./state.js";

beforeEach(() => {
  store.clear();
  ttl.clear();
});

const STATE = { provider: "google" as const, intent: "signin" as const, accountId: null, codeVerifier: "v", nonce: "n", redirectUrl: "/dashboard" };

describe("oauth state", () => {
  it("random ids are 256-bit base64url and unique", () => {
    const a = newOpaqueId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newOpaqueId()).not.toBe(a);
  });

  it("PKCE challenge is base64url(sha256(verifier))", () => {
    expect(pkceChallenge("abc")).toBe(createHash("sha256").update("abc").digest("base64url"));
  });

  it("state is stored for 10 minutes and can be consumed once", async () => {
    await saveOAuthState("s1", STATE);
    expect(ttl.get("auth:oauth:state:s1")).toBe(600);
    expect(await consumeOAuthState("s1")).toEqual(STATE);
    expect(await consumeOAuthState("s1")).toBeNull();
  });

  it("rejects malformed state, and a link state without an account", async () => {
    store.set("auth:oauth:state:bad", "{not json");
    expect(await consumeOAuthState("bad")).toBeNull();
    await saveOAuthState("s2", { ...STATE, intent: "link", accountId: null });
    expect(await consumeOAuthState("s2")).toBeNull();
    await saveOAuthState("s3", { ...STATE, provider: "apple" as never });
    expect(await consumeOAuthState("s3")).toBeNull();
  });

  it("pending entries live 30 minutes and can be deleted", async () => {
    const p = { provider: "facebook" as const, sub: "fb1", email: null, firstName: null, lastName: null, redirectUrl: "/dashboard" };
    await savePendingOAuth("p1", p);
    expect(ttl.get("auth:oauth:pending:p1")).toBe(1800);
    expect(await loadPendingOAuth("p1")).toEqual(p);
    await deletePendingOAuth("p1");
    expect(await loadPendingOAuth("p1")).toBeNull();
  });

  it("safeRelativePath keeps only same-site paths", () => {
    expect(safeRelativePath("/inbox?x=1")).toBe("/inbox?x=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", 5, "/a\nb"]) {
      expect(safeRelativePath(bad)).toBe("/dashboard");
    }
  });
});
