import { describe, it, expect } from "vitest";
import { decide, isPublicAuthPath, retryDelayMs } from "./provider-logic";

describe("decide", () => {
  const base = { userId: "u1", wasSignedIn: false, wasLoaded: false };
  it("503 on first load: unknown, not loaded, retry, no redirect", () => {
    const d = decide({ ...base, token: null, status: "unknown" });
    expect(d.state.isLoaded).toBe(false);
    expect(d.redirect).toBe(false);
    expect(d.retry).toBe(true);
  });
  it("503 after expiry when signed in: no redirect, state kept", () => {
    const d = decide({ ...base, token: null, status: "unknown", wasSignedIn: true, wasLoaded: true });
    expect(d.redirect).toBe(false);
    expect(d.state).toEqual({ isLoaded: true, isSignedIn: true, userId: "u1" });
  });
  it("401 after signed in: redirect", () => {
    const d = decide({ ...base, token: null, status: "signed_out", wasSignedIn: true, wasLoaded: true });
    expect(d.redirect).toBe(true);
    expect(d.state.isSignedIn).toBe(false);
  });
  it("401 on first load (never signed in): no redirect", () => {
    const d = decide({ ...base, token: null, status: "signed_out" });
    expect(d.redirect).toBe(false);
    expect(d.state).toEqual({ isLoaded: true, isSignedIn: false, userId: null });
  });
  it("recovery flips to signed in with userId", () => {
    const d = decide({ ...base, token: "t", status: "signed_in", wasLoaded: true });
    expect(d.state).toEqual({ isLoaded: true, isSignedIn: true, userId: "u1" });
  });
});

describe("retryDelayMs", () => {
  it("backs off and caps at 30s", () => {
    expect([0, 1, 2, 3].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDelayMs(10)).toBe(30_000);
  });
});

const BRANDED_PUBLIC = ["/c/acme/sign-in", "/c/acme/forgot-password", "/c/a-b-c/sign-in", "/c/abc/sign-in", `/c/${"a".repeat(40)}/forgot-password`];
const BRANDED_NOT_PUBLIC = [
  "/c", "/c/", "/c/acme", "/c/acme/", "/c/acme/anything-else", "/c/acme/sign-in/extra", "/c/acme/sign-in/", "/c/acme/reset-password",
  "/c/ab/sign-in", `/c/${"a".repeat(41)}/sign-in`, "/c/Acme/sign-in", "/c/ac_me/sign-in", "/c/../sign-in", "/c/acme/../dashboard",
  "/c/acme/%2e%2e/sign-in", "/c//sign-in", "/c/a.b.c/sign-in", "/x/c/acme/sign-in", "/c/acme/sign-in%2f..%2fdashboard",
];

describe("isPublicAuthPath", () => {
  it.each(BRANDED_PUBLIC)("%s (branded entry) is public", (p) => expect(isPublicAuthPath(p)).toBe(true));
  it.each(BRANDED_NOT_PUBLIC)("%s is not public", (p) => expect(isPublicAuthPath(p)).toBe(false));
  it.each(["/sign-in", "/sign-in/x", "/sign-up", "/forgot-password", "/reset-password", "/admin/sign-in", "/invitations/abc/accept", "/client-invitations/abc/accept"])(
    "%s is public",
    (p) => expect(isPublicAuthPath(p)).toBe(true),
  );
  it.each(["/inbox", "/admin", "/sign-index", "/invitations", "/settings/sign-in"])("%s is not", (p) =>
    expect(isPublicAuthPath(p)).toBe(false),
  );
});
