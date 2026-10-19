import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/server-api", () => ({ getImpersonationCookie: async () => null }));
const refreshSession = vi.fn();
vi.mock("@/lib/auth/bff", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/bff")>("@/lib/auth/bff");
  return { ...actual, refreshSession: (...a: unknown[]) => refreshSession(...a) };
});

import { NextRequest } from "next/server";
import { GET } from "./route";

const jwtWithExp = (s: number) => `a.${btoa(JSON.stringify({ exp: s }))}.c`;
const call = (cookie?: string) =>
  GET(new NextRequest("https://app.test/api/v1/things", { headers: cookie ? { cookie } : {} }), {
    params: Promise.resolve({ path: ["things"] }),
  });

describe("api proxy token handling", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    refreshSession.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stale wb_at: refreshes once, forwards new bearer, sets cookies", async () => {
    refreshSession.mockResolvedValue({ ok: true, accessToken: "new-at", refreshToken: "new-rt" });
    const stale = jwtWithExp(Math.floor(Date.now() / 1000) + 5);
    const res = await call(`wb_at=${stale}; wb_rt=old-rt`);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toSatisfy(
      (h: Headers) => h.get("Authorization") === "Bearer new-at",
    );
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("wb_at=new-at");
    expect(setCookie).toContain("wb_rt=new-rt");
  });
  it("fresh wb_at: no refresh", async () => {
    const fresh = jwtWithExp(Math.floor(Date.now() / 1000) + 600);
    const res = await call(`wb_at=${fresh}; wb_rt=r`);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toEqual([]);
  });
  it("refresh 401: clears cookies, forwards without bearer value", async () => {
    refreshSession.mockResolvedValue({ ok: false, status: 401 });
    const res = await call("wb_rt=r");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toSatisfy(
      (h: Headers) => h.get("Authorization") === "Bearer",
    );
    expect(res.headers.getSetCookie().join("\n")).toContain("wb_rt=;");
  });
});
