import { describe, it, expect, vi } from "vitest";
import {
  shouldAttachImpersonationToken,
  createImpersonatingFetch,
  parseImpersonationSession,
} from "./impersonation";

const config = { apiBase: "http://localhost:4000/", origin: "https://app.example.com" };

describe("shouldAttachImpersonationToken", () => {
  it("attaches for API base URLs (trailing slash stripped)", () => {
    expect(shouldAttachImpersonationToken("http://localhost:4000/v1/contacts", config)).toBe(true);
    expect(shouldAttachImpersonationToken(new URL("http://localhost:4000/v1/x"), config)).toBe(true);
  });
  it("attaches for same-origin /api/v1 calls", () => {
    expect(shouldAttachImpersonationToken("/api/v1/contacts", config)).toBe(true);
    expect(shouldAttachImpersonationToken("https://app.example.com/api/v1/contacts", config)).toBe(true);
  });
  it("never attaches to other origins, including lookalike prefixes", () => {
    expect(shouldAttachImpersonationToken("https://evil.com/v1/contacts", config)).toBe(false);
    expect(shouldAttachImpersonationToken("http://localhost:4000.evil.com/v1/x", config)).toBe(false);
    expect(shouldAttachImpersonationToken("https://evil.com/api/v1/x", config)).toBe(false);
    expect(shouldAttachImpersonationToken("/some/other/path", config)).toBe(false);
  });
  it("never attaches to impersonation admin calls", () => {
    expect(shouldAttachImpersonationToken("http://localhost:4000/v1/admin/impersonation/elevate", config)).toBe(false);
    expect(shouldAttachImpersonationToken("http://localhost:4000/v1/admin/organizations/o1/impersonate", config)).toBe(false);
    expect(shouldAttachImpersonationToken("http://localhost:4000/v1/admin/organizations/o1/users/u1/impersonate", config)).toBe(false);
    expect(shouldAttachImpersonationToken("/api/v1/admin/impersonation/elevate", config)).toBe(false);
  });
});

describe("createImpersonatingFetch", () => {
  const ok = () => new Response("{}", { status: 200 });

  it("adds header and preserves existing headers", async () => {
    const base = vi.fn().mockResolvedValue(ok());
    const f = createImpersonatingFetch(base as unknown as typeof fetch, () => "tok", config);
    await f("http://localhost:4000/v1/contacts", { headers: { Authorization: "Bearer c", "Content-Type": "application/json" }, method: "POST" });
    const [, init] = base.mock.calls[0]!;
    const h = new Headers(init.headers);
    expect(h.get("x-impersonate-token")).toBe("tok");
    expect(h.get("authorization")).toBe("Bearer c");
    expect(h.get("content-type")).toBe("application/json");
    expect(init.method).toBe("POST");
  });

  it("preserves Request inputs and their headers", async () => {
    const base = vi.fn().mockResolvedValue(ok());
    const f = createImpersonatingFetch(base as unknown as typeof fetch, () => "tok", config);
    await f(new Request("http://localhost:4000/v1/contacts", { headers: { "X-Foo": "bar" } }));
    const req = base.mock.calls[0]![0] as Request;
    expect(req.headers.get("x-foo")).toBe("bar");
    expect(req.headers.get("x-impersonate-token")).toBe("tok");
  });

  it("does not touch other origins or when no session", async () => {
    const base = vi.fn().mockResolvedValue(ok());
    const f = createImpersonatingFetch(base as unknown as typeof fetch, () => "tok", config);
    await f("https://evil.com/v1/x", { headers: { A: "1" } });
    expect(base).toHaveBeenLastCalledWith("https://evil.com/v1/x", { headers: { A: "1" } });
    const g = createImpersonatingFetch(base as unknown as typeof fetch, () => null, config);
    await g("http://localhost:4000/v1/x");
    expect(base).toHaveBeenLastCalledWith("http://localhost:4000/v1/x", undefined);
  });

  it("skips header for elevate/revoke calls", async () => {
    const base = vi.fn().mockResolvedValue(ok());
    const f = createImpersonatingFetch(base as unknown as typeof fetch, () => "tok", config);
    await f("http://localhost:4000/v1/admin/impersonation/elevate", { method: "POST", headers: { Authorization: "Bearer c" } });
    const [, init] = base.mock.calls[0]!;
    expect(new Headers(init.headers).has("x-impersonate-token")).toBe(false);
  });

  it("reports IMPERSONATION_* 403 codes and leaves the response readable", async () => {
    const body = JSON.stringify({ error: { code: "IMPERSONATION_READ_ONLY", message: "x" } });
    const base = vi.fn().mockResolvedValue(new Response(body, { status: 403 }));
    const onErr = vi.fn();
    const f = createImpersonatingFetch(base as unknown as typeof fetch, () => "tok", config, onErr);
    const res = await f("http://localhost:4000/v1/contacts", { method: "POST" });
    expect(onErr).toHaveBeenCalledWith("IMPERSONATION_READ_ONLY", expect.any(String));
    expect(await res.text()).toBe(body);
  });

  it("ignores unrelated 403s", async () => {
    const base = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 }));
    const onErr = vi.fn();
    const f = createImpersonatingFetch(base as unknown as typeof fetch, () => "tok", config, onErr);
    await f("http://localhost:4000/v1/contacts");
    expect(onErr).not.toHaveBeenCalled();
  });
});

describe("parseImpersonationSession", () => {
  const now = 1_000_000;
  it("returns null for missing, malformed, tokenless or expired", () => {
    expect(parseImpersonationSession(null, now)).toBeNull();
    expect(parseImpersonationSession("{bad", now)).toBeNull();
    expect(parseImpersonationSession(JSON.stringify({ orgId: "o" }), now)).toBeNull();
    expect(parseImpersonationSession(JSON.stringify({ token: "t", expiresAt: now - 1 }), now)).toBeNull();
    expect(parseImpersonationSession(JSON.stringify({ token: "t" }), now)).toBeNull();
  });
  it("parses a valid session", () => {
    const s = parseImpersonationSession(JSON.stringify({ token: "t", orgId: "o", orgName: "O", userId: "u", userName: "U", mode: "edit", expiresAt: now + 5 }), now);
    expect(s).toMatchObject({ token: "t", mode: "edit", userName: "U" });
  });
});
