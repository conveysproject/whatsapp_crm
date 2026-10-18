import { describe, expect, it } from "vitest";
import {
  canUnlink,
  confirmEmailDestination,
  errorDestination,
  isProviderUrl,
  oauthErrorMessage,
  parseMethods,
  parseStateCookie,
  sessionDestination,
  stateCookieValue,
} from "./oauth";

const STATE = "A".repeat(43);

describe("oauth helpers", () => {
  it("only lets the browser go to the provider's own origin", () => {
    expect(isProviderUrl("google", "https://accounts.google.com/o/oauth2/v2/auth?x=1")).toBe(true);
    expect(isProviderUrl("facebook", "https://www.facebook.com/v25.0/dialog/oauth?x=1")).toBe(true);
    expect(isProviderUrl("google", "https://accounts.google.com.evil.example/")).toBe(false);
    expect(isProviderUrl("google", "https://www.facebook.com/")).toBe(false);
    expect(isProviderUrl("google", "javascript:alert(1)")).toBe(false);
    expect(isProviderUrl("google", 5)).toBe(false);
  });

  it("state cookie round-trips and rejects junk", () => {
    expect(parseStateCookie(stateCookieValue("link", STATE))).toEqual({ intent: "link", state: STATE });
    expect(parseStateCookie(undefined)).toBeNull();
    expect(parseStateCookie(`admin:${STATE}`)).toBeNull();
    expect(parseStateCookie("signin:short")).toBeNull();
    expect(parseStateCookie(`signin:${STATE}<script>`)).toBeNull();
  });

  it("error destinations keep only safe codes", () => {
    expect(errorDestination("signin", "OAUTH_FAILED")).toBe("/sign-in?oauth_error=OAUTH_FAILED");
    expect(errorDestination("link", "OAUTH_ALREADY_LINKED")).toBe("/settings/security?oauth_error=OAUTH_ALREADY_LINKED");
    expect(errorDestination("signin", "<b>x</b>")).toBe("/sign-in?oauth_error=OAUTH_FAILED");
  });

  it("session destination: business details first, then set-password, then a safe redirect", () => {
    expect(sessionDestination({ needsWorkspace: true, redirectUrl: "/inbox" })).toBe("/business-details");
    expect(sessionDestination({ mustSetPassword: true })).toBe("/settings/security?set=1");
    expect(sessionDestination({ redirectUrl: "/inbox" })).toBe("/inbox");
    expect(sessionDestination({ redirectUrl: "//evil.example" })).toBe("/dashboard");
    expect(sessionDestination({})).toBe("/dashboard");
  });

  it("confirm-email destination carries the provider and masked email", () => {
    expect(confirmEmailDestination("facebook", "an***@x.com")).toBe("/sign-in/confirm-email?provider=facebook&email=an***%40x.com");
    expect(confirmEmailDestination("google", null)).toBe("/sign-in/confirm-email?provider=google");
  });

  it("error messages fall back to a generic one", () => {
    expect(oauthErrorMessage(null)).toBeNull();
    expect(oauthErrorMessage("CANCELLED")).toBe("Sign-in was cancelled.");
    expect(oauthErrorMessage("WHATEVER")).toMatch(/couldn't sign you in/);
  });

  it("parseMethods is strict", () => {
    expect(parseMethods({ whatsapp: true, google: "yes", facebook: true })).toEqual({ whatsapp: true, google: false, facebook: true });
    expect(parseMethods(null)).toEqual({ whatsapp: false, google: false, facebook: false });
  });

  it("canUnlink mirrors the API rule", () => {
    const base = { hasPassword: false, mustSetPassword: false, phoneVerified: false, whatsappEnabled: false, linked: ["google"] };
    expect(canUnlink(base, "google")).toBe(false);
    expect(canUnlink({ ...base, hasPassword: true }, "google")).toBe(true);
    expect(canUnlink({ ...base, hasPassword: true, mustSetPassword: true }, "google")).toBe(false);
    expect(canUnlink({ ...base, linked: ["google", "facebook"] }, "google")).toBe(true);
    expect(canUnlink({ ...base, phoneVerified: true }, "google")).toBe(false);
    expect(canUnlink({ ...base, phoneVerified: true, whatsappEnabled: true }, "google")).toBe(true);
  });
});
