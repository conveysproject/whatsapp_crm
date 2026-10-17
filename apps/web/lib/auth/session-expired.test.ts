import { describe, expect, it } from "vitest";
import { sessionExpiredRedirect, shouldRecheckSession } from "./session-expired";

describe("sessionExpiredRedirect", () => {
  it("redirects a 401 in wbmsg mode through the BFF with the encoded path", () => {
    expect(sessionExpiredRedirect(401, "wbmsg", "/contacts?x=1")).toBe(
      "/api/auth/session-expired?redirect_url=" + encodeURIComponent("/contacts?x=1"),
    );
  });
  it("falls back to /dashboard for a missing or unsafe path", () => {
    const d = "/api/auth/session-expired?redirect_url=" + encodeURIComponent("/dashboard");
    expect(sessionExpiredRedirect(401, "wbmsg", null)).toBe(d);
    expect(sessionExpiredRedirect(401, "wbmsg", "//evil.example")).toBe(d);
  });
  it("does nothing for other statuses or Clerk mode", () => {
    expect(sessionExpiredRedirect(500, "wbmsg", "/x")).toBeNull();
    expect(sessionExpiredRedirect(403, "wbmsg", "/x")).toBeNull();
    expect(sessionExpiredRedirect(401, "clerk", "/x")).toBeNull();
  });
});

describe("shouldRecheckSession", () => {
  it("checks only when signed in and not on a public auth page", () => {
    expect(shouldRecheckSession(true, "/contacts")).toBe(true);
    expect(shouldRecheckSession(false, "/contacts")).toBe(false);
    expect(shouldRecheckSession(true, "/sign-in")).toBe(false);
  });
});
