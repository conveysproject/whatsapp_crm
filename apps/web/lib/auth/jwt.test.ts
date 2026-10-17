import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, UnsecuredJWT } from "jose";
import { accessTokenExpiry, verifyAccessToken, resetJwksForTests } from "./jwt";

async function makeKey(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "EdDSA", use: "sig" };
  return { privateKey, jwk };
}

function sign(
  key: CryptoKey,
  kid: string,
  o: { iss?: string; exp?: string | number } = {},
) {
  return new SignJWT({ sid: "s1", typ: "user" })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setSubject("acc_1")
    .setIssuer(o.iss ?? "wbmsg")
    .setAudience("wbmsg-api")
    .setIssuedAt()
    .setExpirationTime(o.exp ?? "10m")
    .sign(key);
}

describe("jwt helpers", () => {
  let jwks: { keys: unknown[] };
  beforeEach(() => {
    resetJwksForTests();
    process.env["AUTH_JWKS_URL"] = "https://api.test/jwks.json";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(jwks), { headers: { "content-type": "application/json" } })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["AUTH_JWKS_URL"];
  });

  it("verifies a valid token", async () => {
    const k = await makeKey("k1");
    jwks = { keys: [k.jwk] };
    const t = await sign(k.privateKey, "k1");
    expect(await verifyAccessToken(t)).toEqual({ userId: "acc_1", sid: "s1", typ: "user" });
  });
  it("rejects wrong issuer, expired, other key", async () => {
    const k = await makeKey("k1");
    const other = await makeKey("k1");
    jwks = { keys: [k.jwk] };
    expect(await verifyAccessToken(await sign(k.privateKey, "k1", { iss: "evil" }))).toBeNull();
    expect(
      await verifyAccessToken(await sign(k.privateKey, "k1", { exp: Math.floor(Date.now() / 1000) - 60 })),
    ).toBeNull();
    expect(await verifyAccessToken(await sign(other.privateKey, "k1"))).toBeNull();
    expect(await verifyAccessToken("garbage")).toBeNull();
  });
  it("rejects wrong audience, alg none, HS256, missing sid, bad typ, no exp", async () => {
    const k = await makeKey("k1");
    jwks = { keys: [k.jwk] };
    const base = (claims: Record<string, unknown>, aud = "wbmsg-api", exp: string | null = "10m") => {
      const j = new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: "k1" }).setSubject("acc_1").setIssuer("wbmsg").setAudience(aud);
      if (exp) j.setExpirationTime(exp);
      return j.sign(k.privateKey);
    };
    expect(await verifyAccessToken(await base({ sid: "s1", typ: "user" }, "other"))).toBeNull();
    expect(await verifyAccessToken(await base({ typ: "user" }))).toBeNull();
    expect(await verifyAccessToken(await base({ sid: "s1", typ: "root" }))).toBeNull();
    expect(await verifyAccessToken(await base({ sid: "s1", typ: "user" }, "wbmsg-api", null))).toBeNull();
    const none = new UnsecuredJWT({ sid: "s1", typ: "user" })
      .setSubject("acc_1").setIssuer("wbmsg").setAudience("wbmsg-api").setExpirationTime("10m").encode();
    expect(await verifyAccessToken(none)).toBeNull();
    const hs = await new SignJWT({ sid: "s1", typ: "user" })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setSubject("acc_1").setIssuer("wbmsg").setAudience("wbmsg-api").setExpirationTime("10m")
      .sign(new TextEncoder().encode("0123456789abcdef0123456789abcdef"));
    expect(await verifyAccessToken(hs)).toBeNull();
  });
  it("accessTokenExpiry", async () => {
    const k = await makeKey("k1");
    const t = await sign(k.privateKey, "k1", { exp: 2_000_000_000 });
    expect(accessTokenExpiry(t)).toBe(2_000_000_000_000);
    expect(accessTokenExpiry("garbage")).toBeNull();
    expect(accessTokenExpiry("a.!!!.c")).toBeNull();
    expect(accessTokenExpiry(`a.${btoa('{"x":1}')}.c`)).toBeNull();
  });
});
