import { describe, it, expect, vi, beforeEach } from "vitest";

const refreshSession = vi.fn();
vi.mock("./bff", () => ({ refreshSession: (...a: unknown[]) => refreshSession(...a) }));

import { resolveProxyToken } from "./proxy-token";

const jwtWithExp = (expSec: number) => `a.${btoa(JSON.stringify({ exp: expSec }))}.c`;
const req = new Request("https://app.test/api/v1/x");

describe("resolveProxyToken", () => {
  beforeEach(() => refreshSession.mockReset());

  it("fresh access token: no refresh", async () => {
    const at = jwtWithExp(Math.floor(Date.now() / 1000) + 600);
    expect(await resolveProxyToken(req, { at, rt: "r" })).toEqual({ token: at });
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("stale access token: one refresh, rotated tokens returned", async () => {
    refreshSession.mockResolvedValue({ ok: true, accessToken: "new-at", refreshToken: "new-rt" });
    const at = jwtWithExp(Math.floor(Date.now() / 1000) + 10);
    const r = await resolveProxyToken(req, { at, rt: "r" });
    expect(r).toEqual({ token: "new-at", rotated: { accessToken: "new-at", refreshToken: "new-rt" } });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledWith("r", req);
  });
  it("missing access token with refresh cookie refreshes", async () => {
    refreshSession.mockResolvedValue({ ok: true, accessToken: "n", refreshToken: "m" });
    expect((await resolveProxyToken(req, { rt: "r" })).token).toBe("n");
  });
  it("401 clears cookies and sends no bearer", async () => {
    refreshSession.mockResolvedValue({ ok: false, status: 401 });
    expect(await resolveProxyToken(req, { at: "stale", rt: "r" })).toEqual({ token: null, clear: true });
  });
  it("503 keeps whatever token exists", async () => {
    refreshSession.mockResolvedValue({ ok: false, status: 503 });
    expect(await resolveProxyToken(req, { at: "stale", rt: "r" })).toEqual({ token: "stale" });
    expect(await resolveProxyToken(req, { rt: "r" })).toEqual({ token: null });
  });
  it("no refresh cookie: returns the access cookie as is", async () => {
    expect(await resolveProxyToken(req, { at: "x" })).toEqual({ token: "x" });
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
