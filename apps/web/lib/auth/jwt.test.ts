import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
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
  it("accessTokenExpiry", async () => {
    const k = await makeKey("k1");
    const t = await sign(k.privateKey, "k1", { exp: 2_000_000_000 });
    expect(accessTokenExpiry(t)).toBe(2_000_000_000_000);
    expect(accessTokenExpiry("garbage")).toBeNull();
    expect(accessTokenExpiry("a.!!!.c")).toBeNull();
    expect(accessTokenExpiry(`a.${btoa('{"x":1}')}.c`)).toBeNull();
  });
});
