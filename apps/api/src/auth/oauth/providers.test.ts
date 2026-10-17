import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { googleProvider, setGoogleJwksForTests } from "./google.js";
import { facebookProvider } from "./facebook.js";
import { getOAuthProvider } from "./registry.js";
import { oauthRedirectUri } from "./types.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let key: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  setGoogleJwksForTests(createLocalJWKSet({ keys: [jwk] }));
});

const idToken = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? "https://accounts.google.com")
    .setAudience(opts.aud ?? "gid")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env["AUTH_GOOGLE_CLIENT_ID"] = "gid";
  process.env["AUTH_GOOGLE_CLIENT_SECRET"] = "gsecret";
  process.env["AUTH_FACEBOOK_APP_ID"] = "fid";
  process.env["AUTH_FACEBOOK_APP_SECRET"] = "fsecret";
  process.env["WEB_URL"] = "https://app.wbmsg.test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [
    "AUTH_GOOGLE_CLIENT_ID",
    "AUTH_GOOGLE_CLIENT_SECRET",
    "AUTH_FACEBOOK_APP_ID",
    "AUTH_FACEBOOK_APP_SECRET",
    "WEB_URL",
    "AUTH_OAUTH_REDIRECT_BASE",
  ]) delete process.env[k];
});

const REDIRECT = "https://app.wbmsg.test/api/auth/oauth/google/callback";

describe("redirect URI + registry", () => {
  it("points at the web BFF callback; AUTH_OAUTH_REDIRECT_BASE wins over WEB_URL", () => {
    expect(oauthRedirectUri("google")).toBe(REDIRECT);
    process.env["AUTH_OAUTH_REDIRECT_BASE"] = "https://login.wbmsg.test/";
    expect(oauthRedirectUri("facebook")).toBe("https://login.wbmsg.test/api/auth/oauth/facebook/callback");
    process.env["AUTH_OAUTH_REDIRECT_BASE"] = "not a url";
    expect(oauthRedirectUri("google")).toBeNull();
  });

  it("providers are enabled only with id, secret and a redirect base", () => {
    expect(googleProvider.enabled()).toBe(true);
    expect(facebookProvider.enabled()).toBe(true);
    delete process.env["AUTH_GOOGLE_CLIENT_SECRET"];
    delete process.env["WEB_URL"];
    expect(googleProvider.enabled()).toBe(false);
    expect(facebookProvider.enabled()).toBe(false);
  });

  it("registry knows only google and facebook", () => {
    expect(getOAuthProvider("google")).toBe(googleProvider);
    expect(getOAuthProvider("facebook")).toBe(facebookProvider);
    expect(getOAuthProvider("toString")).toBeNull();
    expect(getOAuthProvider("apple")).toBeNull();
  });
});

describe("google", () => {
  it("authorize URL carries PKCE S256, state, nonce and the OIDC scopes", () => {
    const url = new URL(googleProvider.authorizeUrl({ state: "st", codeChallenge: "ch", nonce: "nn", redirectUri: REDIRECT }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({
      client_id: "gid",
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "openid email profile",
      state: "st",
      nonce: "nn",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("exchanges the code with the verifier and returns the verified identity", async () => {
    fetchMock.mockResolvedValue(
      json(200, { id_token: await idToken({ sub: "g-1", email: "A@x.com", email_verified: true, given_name: "Ann", family_name: "Lee", nonce: "nn" }) }),
    );
    const id = await googleProvider.exchange({ code: "c", codeVerifier: "v", nonce: "nn", redirectUri: REDIRECT });
    expect(id).toEqual({ sub: "g-1", email: "A@x.com", emailVerified: true, firstName: "Ann", lastName: "Lee" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      code: "c",
      client_id: "gid",
      client_secret: "gsecret",
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
      code_verifier: "v",
    });
  });

  it("unverified email is reported as such", async () => {
    fetchMock.mockResolvedValue(json(200, { id_token: await idToken({ sub: "g-1", email: "a@x.com", email_verified: false, nonce: "nn" }) }));
    const id = await googleProvider.exchange({ code: "c", codeVerifier: "v", nonce: "nn", redirectUri: REDIRECT });
    expect(id.emailVerified).toBe(false);
  });

  it.each([
    ["wrong nonce", { claims: { sub: "g", nonce: "other" } }],
    ["wrong audience", { claims: { sub: "g", nonce: "nn" }, aud: "someone-else" }],
    ["wrong issuer", { claims: { sub: "g", nonce: "nn" }, iss: "https://evil.example" }],
    ["no sub", { claims: { nonce: "nn" } }],
  ])("rejects an ID token with %s", async (_l, t: { claims: Record<string, unknown>; aud?: string; iss?: string }) => {
    fetchMock.mockResolvedValue(json(200, { id_token: await idToken(t.claims, t) }));
    await expect(googleProvider.exchange({ code: "c", codeVerifier: "v", nonce: "nn", redirectUri: REDIRECT })).rejects.toThrow(
      /google/,
    );
  });

  it("rejects a forged token, a failed exchange and a network error", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ sub: "g", nonce: "nn" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience("gid")
      .setExpirationTime("5m")
      .sign(other.privateKey);
    fetchMock.mockResolvedValueOnce(json(200, { id_token: forged }));
    fetchMock.mockResolvedValueOnce(json(400, { error: "invalid_grant" }));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    const run = () => googleProvider.exchange({ code: "c", codeVerifier: "v", nonce: "nn", redirectUri: REDIRECT });
    await expect(run()).rejects.toThrow("id_token invalid");
    await expect(run()).rejects.toThrow("rejected (400)");
    await expect(run()).rejects.toThrow("request failed");
  });
});

describe("facebook", () => {
  const FB_REDIRECT = "https://app.wbmsg.test/api/auth/oauth/facebook/callback";

  it("authorize URL asks for email,public_profile with PKCE", () => {
    const url = new URL(facebookProvider.authorizeUrl({ state: "st", codeChallenge: "ch", nonce: "nn", redirectUri: FB_REDIRECT }));
    expect(url.hostname).toBe("www.facebook.com");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "fid",
      redirect_uri: FB_REDIRECT,
      scope: "email,public_profile",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      response_type: "code",
    });
  });

  it("exchanges the code, then reads /me with appsecret_proof; email never counts as verified", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "fbtok" }));
    fetchMock.mockResolvedValueOnce(json(200, { id: "fb-1", email: "b@x.com", first_name: "Bo", last_name: "Ng" }));
    const id = await facebookProvider.exchange({ code: "c", codeVerifier: "v", nonce: "", redirectUri: FB_REDIRECT });
    expect(id).toEqual({ sub: "fb-1", email: "b@x.com", emailVerified: false, firstName: "Bo", lastName: "Ng" });
    const tokenUrl = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(Object.fromEntries(tokenUrl.searchParams)).toEqual({
      client_id: "fid",
      client_secret: "fsecret",
      redirect_uri: FB_REDIRECT,
      code: "c",
      code_verifier: "v",
    });
    const [meUrl, meInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(meUrl).not.toContain("fbtok");
    expect(new URL(meUrl).searchParams.get("appsecret_proof")).toBe(createHmac("sha256", "fsecret").update("fbtok").digest("hex"));
    expect((meInit.headers as Record<string, string>)["authorization"]).toBe("Bearer fbtok");
  });

  it("no email: identity with email null", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "fbtok" }));
    fetchMock.mockResolvedValueOnce(json(200, { id: "fb-1" }));
    const id = await facebookProvider.exchange({ code: "c", codeVerifier: "v", nonce: "", redirectUri: FB_REDIRECT });
    expect(id.email).toBeNull();
  });

  it("fails on a rejected exchange or a /me without id", async () => {
    fetchMock.mockResolvedValueOnce(json(400, {}));
    const run = () => facebookProvider.exchange({ code: "c", codeVerifier: "v", nonce: "", redirectUri: FB_REDIRECT });
    await expect(run()).rejects.toThrow("rejected (400)");
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "t" }));
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await expect(run()).rejects.toThrow("no id");
  });
});
