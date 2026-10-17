import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, UnsecuredJWT, errors, exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { getJwks, resetTokenKeysForTests, signAccessToken, verifyAccessToken } from "./tokens.js";

const b64 = (s: string) => Buffer.from(s).toString("base64");
let cur: Awaited<ReturnType<typeof generateKeyPair>>;
let prev: Awaited<ReturnType<typeof generateKeyPair>>;
let other: Awaited<ReturnType<typeof generateKeyPair>>;
let curPriv: string;
let prevPub: string;

beforeAll(async () => {
  cur = await generateKeyPair("EdDSA", { extractable: true });
  prev = await generateKeyPair("EdDSA", { extractable: true });
  other = await generateKeyPair("EdDSA", { extractable: true });
  curPriv = b64(await exportPKCS8(cur.privateKey));
  prevPub = b64(await exportSPKI(prev.publicKey));
});

const claims = { sub: "usr_abc", sid: "sid_1", typ: "user" as const };

beforeEach(() => {
  process.env.AUTH_JWT_PRIVATE_KEY = curPriv;
  process.env.AUTH_JWT_KID = "k1";
  delete process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY;
  delete process.env.AUTH_JWT_PREVIOUS_KID;
  resetTokenKeysForTests();
});
afterEach(() => { vi.useRealTimers(); });

const forge = (key: unknown, opts: { aud?: string; kid?: string; alg?: string } = {}) =>
  new SignJWT({ sid: "sid_1", typ: "user" })
    .setProtectedHeader({ alg: (opts.alg ?? "EdDSA") as string, kid: opts.kid ?? "k1" })
    .setSubject("usr_abc").setIssuer("wbmsg").setAudience(opts.aud ?? "wbmsg-api")
    .setIssuedAt().setExpirationTime("10m").sign(key as never);

describe("access tokens", () => {
  it("round-trips claims", async () => {
    expect(await verifyAccessToken(await signAccessToken(claims))).toEqual(claims);
  });
  it("rejects a token signed by another key", async () => {
    await expect(verifyAccessToken(await forge(other.privateKey))).rejects.toThrow();
  });
  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const t = await signAccessToken(claims);
    vi.setSystemTime(Date.now() + 601_000);
    await expect(verifyAccessToken(t)).rejects.toThrow();
  });
  it("rejects wrong audience", async () => {
    await expect(verifyAccessToken(await forge(cur.privateKey, { aud: "other" }))).rejects.toThrow();
  });
  it("rejects unknown kid", async () => {
    await expect(verifyAccessToken(await forge(cur.privateKey, { kid: "zzz" }))).rejects.toThrow();
  });
  it("verifies a token signed with the previous key", async () => {
    process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY = prevPub;
    process.env.AUTH_JWT_PREVIOUS_KID = "k0";
    resetTokenKeysForTests();
    const t = await forge(prev.privateKey, { kid: "k0" });
    expect((await verifyAccessToken(t)).sub).toBe("usr_abc");
  });
  it("rejects an HS256 token", async () => {
    const t = await new SignJWT({ sid: "s", typ: "user" })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setSubject("usr_abc").setIssuer("wbmsg").setAudience("wbmsg-api")
      .setExpirationTime("10m").sign(new TextEncoder().encode("x".repeat(32)));
    await expect(verifyAccessToken(t)).rejects.toThrow();
  });
  it("JWKS has public keys only", async () => {
    process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY = prevPub;
    process.env.AUTH_JWT_PREVIOUS_KID = "k0";
    resetTokenKeysForTests();
    const { keys } = await getJwks();
    expect(keys.map((k) => k.kid)).toEqual(["k1", "k0"]);
    for (const k of keys) {
      expect(k.d).toBeUndefined();
      expect(k.alg).toBe("EdDSA");
      expect(k.use).toBe("sig");
    }
  });
  it("throws a clear error when the key is missing", async () => {
    delete process.env.AUTH_JWT_PRIVATE_KEY;
    resetTokenKeysForTests();
    await expect(signAccessToken(claims)).rejects.toThrow(/AUTH_JWT_PRIVATE_KEY/);
  });

  describe("hardening", () => {
    const mk = (opts: { sub?: string; sid?: string; iss?: string; exp?: boolean; kid?: string | null } = {}) => {
      const jwt = new SignJWT({ sid: opts.sid ?? "sid_1", typ: "user" })
        .setProtectedHeader(opts.kid === null ? { alg: "EdDSA" } : { alg: "EdDSA", kid: opts.kid ?? "k1" })
        .setIssuer(opts.iss ?? "wbmsg").setAudience("wbmsg-api").setIssuedAt();
      jwt.setSubject(opts.sub ?? "usr_abc");
      if (opts.exp !== false) jwt.setExpirationTime("10m");
      return jwt.sign(cur.privateKey);
    };

    it("rejects a token with no kid header (no matching key)", async () => {
      await expect(verifyAccessToken(await mk({ kid: null }))).rejects.toBeInstanceOf(errors.JWKSNoMatchingKey);
    });
    it("rejects an unknown kid with JWKSNoMatchingKey", async () => {
      await expect(verifyAccessToken(await mk({ kid: "zzz" }))).rejects.toBeInstanceOf(errors.JWKSNoMatchingKey);
    });
    it("rejects alg none", async () => {
      const t = new UnsecuredJWT({ sid: "sid_1", typ: "user" })
        .setSubject("usr_abc").setIssuer("wbmsg").setAudience("wbmsg-api").setIssuedAt().setExpirationTime("10m").encode();
      await expect(verifyAccessToken(t)).rejects.toMatchObject({ code: "ERR_JOSE_ALG_NOT_ALLOWED" });
    });
    it("rejects the wrong issuer with a claim failure on iss", async () => {
      const err = await verifyAccessToken(await mk({ iss: "evil" })).catch((e) => e);
      expect(err).toBeInstanceOf(errors.JWTClaimValidationFailed);
      expect(err.claim).toBe("iss");
    });
    it("rejects a tampered payload as a signature failure", async () => {
      const [h, , sig] = (await mk()).split(".");
      const payload = Buffer.from(JSON.stringify({ sub: "usr_admin", sid: "sid_1", typ: "admin", iss: "wbmsg", aud: "wbmsg-api", iat: 1, exp: 9999999999 })).toString("base64url");
      await expect(verifyAccessToken(`${h}.${payload}.${sig}`)).rejects.toBeInstanceOf(errors.JWSSignatureVerificationFailed);
    });
    it("rejects a token without exp (claim failure on exp)", async () => {
      const err = await verifyAccessToken(await mk({ exp: false })).catch((e) => e);
      expect(err).toBeInstanceOf(errors.JWTClaimValidationFailed);
      expect(err.claim).toBe("exp");
    });
    it("rejects an empty sub", async () => {
      const err = await verifyAccessToken(await mk({ sub: "" })).catch((e) => e);
      expect(err).toBeInstanceOf(errors.JWTClaimValidationFailed);
      expect(err.claim).toBe("sub");
    });
    it("rejects an empty sid", async () => {
      const err = await verifyAccessToken(await mk({ sid: "" })).catch((e) => e);
      expect(err).toBeInstanceOf(errors.JWTClaimValidationFailed);
      expect(err.claim).toBe("sid");
    });
  });

  describe("key configuration", () => {
    it("rejects a private key that is not Ed25519, without printing it", async () => {
      const rsa = await generateKeyPair("RS256", { extractable: true });
      const pem = await exportPKCS8(rsa.privateKey);
      process.env.AUTH_JWT_PRIVATE_KEY = b64(pem);
      resetTokenKeysForTests();
      const err = await signAccessToken(claims).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/Ed25519/);
      expect(err.message).not.toContain("PRIVATE KEY");
    });
    it("throws on a half-set previous pair (public key only)", async () => {
      process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY = prevPub;
      resetTokenKeysForTests();
      await expect(signAccessToken(claims)).rejects.toThrow(/AUTH_JWT_PREVIOUS/);
    });
    it("throws on a half-set previous pair (kid only)", async () => {
      process.env.AUTH_JWT_PREVIOUS_KID = "k0";
      resetTokenKeysForTests();
      await expect(signAccessToken(claims)).rejects.toThrow(/AUTH_JWT_PREVIOUS/);
    });
    it("throws when the previous kid equals the current kid", async () => {
      process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY = prevPub;
      process.env.AUTH_JWT_PREVIOUS_KID = "k1";
      resetTokenKeysForTests();
      await expect(signAccessToken(claims)).rejects.toThrow(/differ/);
    });
  });
});
