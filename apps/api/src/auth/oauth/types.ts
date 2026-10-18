export type OAuthProviderId = "google" | "facebook";
export const OAUTH_PROVIDERS: readonly OAuthProviderId[] = ["google", "facebook"];

/** What a provider tells us about the person after a successful code exchange. */
export interface OAuthIdentity {
  sub: string;
  email: string | null;
  /** True only when the provider vouches for the email (Google `email_verified`). Facebook is always false. */
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

/** One adapter per provider; adding Apple or Microsoft later is one more implementation. */
export interface OAuthProvider {
  id: OAuthProviderId;
  label: string;
  enabled(): boolean;
  authorizeUrl(input: { state: string; codeChallenge: string; nonce: string; redirectUri: string }): string;
  exchange(input: { code: string; codeVerifier: string; nonce: string; redirectUri: string }): Promise<OAuthIdentity>;
}

/** Provider call failed (bad code, network, invalid ID token). The message never contains tokens. */
export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

/** Where providers send the browser back: the web BFF, which keeps tokens in httpOnly cookies. */
export function oauthRedirectUri(provider: OAuthProviderId): string | null {
  const base = (process.env["AUTH_OAUTH_REDIRECT_BASE"] || process.env["WEB_URL"] || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(base)) return null;
  return `${base}/api/auth/oauth/${provider}/callback`;
}
