import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { OAuthError, oauthRedirectUri, type OAuthIdentity, type OAuthProvider } from "./types.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let jwks: JWTVerifyGetKey | null = null;
function googleKeys(): JWTVerifyGetKey {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}
export function setGoogleJwksForTests(keys: JWTVerifyGetKey | null): void {
  jwks = keys;
}

const clientId = () => process.env["AUTH_GOOGLE_CLIENT_ID"]?.trim() ?? "";
const clientSecret = () => process.env["AUTH_GOOGLE_CLIENT_SECRET"]?.trim() ?? "";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Google sign-in: OpenID Connect authorization code + PKCE; the ID token is verified against Google's keys. */
export const googleProvider: OAuthProvider = {
  id: "google",
  label: "Google",
  enabled: () => Boolean(clientId() && clientSecret() && oauthRedirectUri("google")),

  authorizeUrl({ state, codeChallenge, nonce, redirectUri }) {
    const q = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `${AUTHORIZE_URL}?${q.toString()}`;
  },

  async exchange({ code, codeVerifier, nonce, redirectUri }): Promise<OAuthIdentity> {
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          code,
          client_id: clientId(),
          client_secret: clientSecret(),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new OAuthError("google token request failed");
    }
    if (!res.ok) throw new OAuthError(`google token exchange rejected (${res.status})`);
    const data = (await res.json().catch(() => ({}))) as { id_token?: unknown };
    if (typeof data.id_token !== "string") throw new OAuthError("google returned no id_token");

    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(data.id_token, googleKeys(), { issuer: ISSUERS, audience: clientId() }));
    } catch {
      throw new OAuthError("google id_token invalid");
    }
    if (payload["nonce"] !== nonce) throw new OAuthError("google id_token nonce mismatch");
    const sub = str(payload["sub"]);
    if (!sub) throw new OAuthError("google id_token has no sub");
    const verified = payload["email_verified"];
    return {
      sub,
      email: str(payload["email"]),
      emailVerified: verified === true || verified === "true",
      firstName: str(payload["given_name"]),
      lastName: str(payload["family_name"]),
    };
  },
};
