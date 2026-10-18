import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verify = vi.fn();
const refresh = vi.fn();
vi.mock("./jwt", async (orig) => ({
  ...(await orig<typeof import("./jwt")>()),
  verifyAccessToken: (t: string) => verify(t),
}));
vi.mock("./bff", async (orig) => ({
  ...(await orig<typeof import("./bff")>()),
  refreshSession: (...a: unknown[]) => refresh(...a),
}));

import { wbmsgMiddleware } from "./middleware-wbmsg";

function jwt(expSec: number): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "EdDSA" })}.${b({ exp: expSec })}.sig`;
}
const now = () => Math.floor(Date.now() / 1000);
const fresh = () => jwt(now() + 600);
const stale = () => jwt(now() + 10);

function req(path: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(`https://app.test${path}`, { headers: cookie ? { cookie } : {} });
}
const loc = (r: Response) => r.headers.get("location");

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ userId: "u", sid: "s", typ: "user" });
  refresh.mockReset();
});

describe("wbmsgMiddleware", () => {
  it("passes public routes without a session", async () => {
    for (const p of ["/sign-in", "/sign-up/x", "/terms", "/docs/a", "/admin/sign-in", "/invitations/t/accept"]) {
      const r = await wbmsgMiddleware(req(p));
      expect(r.headers.get("x-middleware-next"), p).toBe("1");
    }
  });
  describe("x-pathname", () => {
    const fwd = (r: Response) => r.headers.get("x-middleware-request-x-pathname");
    it("forwards pathname + search to a protected page", async () => {
      expect(fwd(await wbmsgMiddleware(req("/inbox?a=1&b=2", { wb_at: fresh() })))).toBe("/inbox?a=1&b=2");
    });
    it("forwards it on public pages and on the refresh path (cookies unchanged)", async () => {
      expect(fwd(await wbmsgMiddleware(req("/terms")))).toBe("/terms");
      refresh.mockResolvedValue({ ok: true, accessToken: "A", refreshToken: "R" });
      const r = await wbmsgMiddleware(req("/inbox?x=1", { theme: "t", wb_at: stale(), wb_rt: "rt" }));
      expect(fwd(r)).toBe("/inbox?x=1");
      expect(r.headers.get("x-middleware-request-cookie")).toBe("theme=t; wb_at=A; wb_rt=R");
    });
    it("overwrites a client-supplied x-pathname", async () => {
      const spoof = new NextRequest("https://app.test/inbox", {
        headers: { cookie: `wb_at=${fresh()}`, "x-pathname": "//evil.example" },
      });
      expect(fwd(await wbmsgMiddleware(spoof))).toBe("/inbox");
    });
    it("is never set for /api routes", async () => {
      expect(fwd(await wbmsgMiddleware(req("/api/auth/token")))).toBeNull();
    });
    it("is not set when the path is not a safe relative path", async () => {
      const r = await wbmsgMiddleware(req("/a%5Cb", { wb_at: fresh() }));
      expect(fwd(r)).toBeNull();
    });
  });
  it("never touches /api routes", async () => {
    const r = await wbmsgMiddleware(req("/api/auth/token"));
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(verify).not.toHaveBeenCalled();
  });
  it("passes a protected route with a fresh token", async () => {
    const r = await wbmsgMiddleware(req("/inbox", { wb_at: fresh() }));
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("forwards other cookies byte-identical when refreshing", async () => {
    refresh.mockResolvedValue({ ok: true, accessToken: "NEWAT", refreshToken: "NEWRT" });
    const r = await wbmsgMiddleware(req("/inbox", { theme: "a%3Db", wb_at: stale(), wb_rt: "oldrt", x: "1" }));
    expect(r.headers.get("x-middleware-request-cookie")).toBe("theme=a%3Db; x=1; wb_at=NEWAT; wb_rt=NEWRT");
  });
  it("refreshes a stale token, sets cookies and forwards the new token", async () => {
    refresh.mockResolvedValue({ ok: true, accessToken: "NEWAT", refreshToken: "NEWRT" });
    const r = await wbmsgMiddleware(req("/inbox", { wb_at: stale(), wb_rt: "oldrt" }));
    expect(refresh).toHaveBeenCalledWith("oldrt", expect.anything());
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(r.cookies.get("wb_at")?.value).toBe("NEWAT");
    expect(r.cookies.get("wb_rt")?.value).toBe("NEWRT");
    expect(r.headers.get("x-middleware-request-cookie")).toContain("wb_at=NEWAT");
  });
  it("refreshes when only wb_rt is present", async () => {
    refresh.mockResolvedValue({ ok: true, accessToken: "A", refreshToken: "R" });
    const r = await wbmsgMiddleware(req("/inbox", { wb_rt: "rt" }));
    expect(r.cookies.get("wb_at")?.value).toBe("A");
  });
  it("treats an unverifiable token as no token", async () => {
    verify.mockResolvedValue(null);
    refresh.mockResolvedValue({ ok: false, status: 401 });
    const r = await wbmsgMiddleware(req("/inbox", { wb_at: fresh(), wb_rt: "rt" }));
    expect(loc(r)).toContain("/sign-in?redirect_url=%2Finbox");
  });
  it("clears cookies and redirects on refresh 401", async () => {
    refresh.mockResolvedValue({ ok: false, status: 401 });
    const r = await wbmsgMiddleware(req("/inbox?a=1", { wb_rt: "rt" }));
    expect(loc(r)).toBe("https://app.test/sign-in?redirect_url=%2Finbox%3Fa%3D1");
    expect(r.cookies.get("wb_rt")?.value).toBe("");
  });
  it("lets the request through on refresh 503 without signing out", async () => {
    refresh.mockResolvedValue({ ok: false, status: 503 });
    const r = await wbmsgMiddleware(req("/inbox", { wb_rt: "rt" }));
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(r.cookies.get("wb_rt")).toBeUndefined();
  });
  it("redirects to /sign-in without a session", async () => {
    const r = await wbmsgMiddleware(req("/inbox"));
    expect(loc(r)).toBe("https://app.test/sign-in?redirect_url=%2Finbox");
  });
  it("redirects admin routes to /admin/sign-in", async () => {
    const r = await wbmsgMiddleware(req("/admin/x"));
    expect(loc(r)).toBe("https://app.test/admin/sign-in?redirect_url=%2Fadmin%2Fx");
  });
  it("sends a signed-in user on / to /dashboard", async () => {
    const r = await wbmsgMiddleware(req("/", { wb_at: fresh() }));
    expect(loc(r)).toBe("https://app.test/dashboard");
  });
  it("keeps / public when signed out", async () => {
    const r = await wbmsgMiddleware(req("/"));
    expect(r.headers.get("x-middleware-next")).toBe("1");
  });
});
