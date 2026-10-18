// Edge-safe pure helpers for Google / Facebook sign-in and the WhatsApp code (own auth only).
import { safeRedirect } from "./redirect";

export type OAuthProviderId = "google" | "facebook";
export const OAUTH_PROVIDERS: readonly OAuthProviderId[] = ["google", "facebook"];
export const PROVIDER_LABEL: Record<OAuthProviderId, string> = { google: "Google", facebook: "Facebook" };

export const isOAuthProvider = (v: unknown): v is OAuthProviderId => v === "google" || v === "facebook";

/** httpOnly cookies, scoped to /api/auth/oauth: "<intent>:<state>" for the round trip, and the pending id. */
export const OAUTH_COOKIE = { state: "wb_oauth", pending: "wb_oauth_pending" } as const;
export const OAUTH_COOKIE_PATH = "/api/auth/oauth";

/** The only places the start route may send the browser. */
const PROVIDER_ORIGINS: Record<OAuthProviderId, string> = {
  google: "https://accounts.google.com",
  facebook: "https://www.facebook.com",
};
export function isProviderUrl(provider: OAuthProviderId, url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).origin === PROVIDER_ORIGINS[provider];
  } catch {
    return false;
  }
}

export type OAuthIntent = "signin" | "link";

export function stateCookieValue(intent: OAuthIntent, state: string): string {
  return `${intent}:${state}`;
}
export function parseStateCookie(raw: string | undefined): { intent: OAuthIntent; state: string } | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  const intent = raw.slice(0, i);
  const state = raw.slice(i + 1);
  if ((intent !== "signin" && intent !== "link") || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) return null;
  return { intent, state };
}

/** Where a failed flow lands: link attempts go back to Security settings, sign-ins to the sign-in page. */
export function errorDestination(intent: OAuthIntent, code: unknown): string {
  const c = typeof code === "string" && /^[A-Z_]{1,40}$/.test(code) ? code : "OAUTH_FAILED";
  return `${intent === "link" ? "/settings/security" : "/sign-in"}?oauth_error=${c}`;
}

/** After a successful sign-in: new accounts set up their business first, then forced password resets, then the target. */
export function sessionDestination(data: Record<string, unknown>): string {
  if (data["needsWorkspace"] === true) return "/business-details";
  if (data["mustSetPassword"] === true) return "/settings/security?set=1";
  return safeRedirect(typeof data["redirectUrl"] === "string" ? data["redirectUrl"] : null);
}

export function confirmEmailDestination(provider: OAuthProviderId, maskedEmail: unknown): string {
  const q = new URLSearchParams({ provider });
  if (typeof maskedEmail === "string" && maskedEmail) q.set("email", maskedEmail);
  return `/sign-in/confirm-email?${q.toString()}`;
}

const MESSAGES: Record<string, string> = {
  CANCELLED: "Sign-in was cancelled.",
  OAUTH_STATE_INVALID: "That sign-in took too long or was opened in another browser. Please try again.",
  OAUTH_FAILED: "We couldn't sign you in that way. Please try again or use another way to sign in.",
  OAUTH_NOT_ALLOWED: "This account can't use that sign-in option. Sign in with your email instead.",
  OAUTH_ALREADY_LINKED: "That account is already connected to a different WBMSG account.",
  OAUTH_PROVIDER_CONFLICT: "Your WBMSG account is already connected to a different account of that kind. Remove it first.",
  OAUTH_EXPIRED: "This sign-in expired. Please start again.",
  FEATURE_DISABLED: "That sign-in option is not available right now.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  UNAVAILABLE: "Sign-in is temporarily unavailable. Please try again shortly.",
};

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES["OAUTH_FAILED"]!;
}

export interface AuthMethods {
  whatsapp: boolean;
  google: boolean;
  facebook: boolean;
}
export const NO_METHODS: AuthMethods = { whatsapp: false, google: false, facebook: false };

export function parseMethods(body: unknown): AuthMethods {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return { whatsapp: b["whatsapp"] === true, google: b["google"] === true, facebook: b["facebook"] === true };
}

/** Sign-in options that remain when one provider is removed (mirrors the API's unlink rule). */
export function canUnlink(info: {
  hasPassword: boolean;
  mustSetPassword: boolean;
  phoneVerified: boolean;
  whatsappEnabled: boolean;
  linked: string[];
}, provider: string): boolean {
  const others =
    info.linked.filter((p) => p !== provider).length +
    (info.hasPassword && !info.mustSetPassword ? 1 : 0) +
    (info.phoneVerified && info.whatsappEnabled ? 1 : 0);
  return others > 0;
}
