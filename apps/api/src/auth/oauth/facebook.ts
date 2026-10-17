import { createHmac } from "node:crypto";
import { OAuthError, oauthRedirectUri, type OAuthIdentity, type OAuthProvider } from "./types.js";

const GRAPH = "https://graph.facebook.com/v25.0";
const DIALOG = "https://www.facebook.com/v25.0/dialog/oauth";

const appId = () => process.env["AUTH_FACEBOOK_APP_ID"]?.trim() ?? "";
const appSecret = () => process.env["AUTH_FACEBOOK_APP_SECRET"]?.trim() ?? "";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function getJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new OAuthError("facebook request failed");
  }
  if (!res.ok) throw new OAuthError(`facebook request rejected (${res.status})`);
  const data = (await res.json().catch(() => null)) as unknown;
  if (!data || typeof data !== "object") throw new OAuthError("facebook returned no JSON");
  return data as Record<string, unknown>;
}

/**
 * Facebook Login: authorization code (+ PKCE) exchanged server-side with the app secret, then Graph /me.
 * Facebook does not promise a verified email, so the email is always reported as unverified.
 */
export const facebookProvider: OAuthProvider = {
  id: "facebook",
  label: "Facebook",
  enabled: () => Boolean(appId() && appSecret() && oauthRedirectUri("facebook")),

  authorizeUrl({ state, codeChallenge, redirectUri }) {
    const q = new URLSearchParams({
      client_id: appId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email,public_profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${DIALOG}?${q.toString()}`;
  },

  async exchange({ code, codeVerifier, redirectUri }): Promise<OAuthIdentity> {
    const tq = new URLSearchParams({
      client_id: appId(),
      client_secret: appSecret(),
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    });
    const token = await getJson(`${GRAPH}/oauth/access_token?${tq.toString()}`);
    const accessToken = str(token["access_token"]);
    if (!accessToken) throw new OAuthError("facebook returned no access_token");

    // appsecret_proof binds the call to our app; the token goes in a header, never in a logged URL.
    const proof = createHmac("sha256", appSecret()).update(accessToken).digest("hex");
    const me = await getJson(`${GRAPH}/me?fields=id,email,first_name,last_name&appsecret_proof=${proof}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const sub = str(me["id"]);
    if (!sub) throw new OAuthError("facebook /me has no id");
    return {
      sub,
      email: str(me["email"]),
      emailVerified: false,
      firstName: str(me["first_name"]),
      lastName: str(me["last_name"]),
    };
  },
};
