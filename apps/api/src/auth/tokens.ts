import {
  SignJWT,
  exportJWK,
  importSPKI,
  jwtVerify,
  type JWK,
  type JWTVerifyGetKey,
} from "jose";
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

export type AccessClaims = { sub: string; sid: string; typ: "user" | "admin" };

const ISSUER = "wbmsg";
const AUDIENCE = "wbmsg-api";
const TTL_SECONDS = 600;

type Keys = {
  kid: string;
  privateKey: CryptoKey | KeyObject;
  publics: { kid: string; key: CryptoKey | KeyObject }[];
};

let cache: { sig: string; keys: Promise<Keys> } | null = null;

export function resetTokenKeysForTests(): void {
  cache = null;
}

const decode = (b64: string) => Buffer.from(b64, "base64").toString("utf8");

async function load(): Promise<Keys> {
  const rawPriv = process.env.AUTH_JWT_PRIVATE_KEY;
  const kid = process.env.AUTH_JWT_KID;
  if (!rawPriv || !kid) {
    throw new Error("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_KID must be set to sign or verify access tokens");
  }
  const privateKey = createPrivateKey(decode(rawPriv));
  const publics: Keys["publics"] = [{ kid, key: createPublicKey(privateKey) }];
  const prevPub = process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY;
  const prevKid = process.env.AUTH_JWT_PREVIOUS_KID;
  if (prevPub && prevKid) {
    publics.push({ kid: prevKid, key: await importSPKI(decode(prevPub), "EdDSA", { extractable: true }) });
  }
  return { kid, privateKey, publics };
}

function keys(): Promise<Keys> {
  const sig = [
    process.env.AUTH_JWT_PRIVATE_KEY,
    process.env.AUTH_JWT_KID,
    process.env.AUTH_JWT_PREVIOUS_PUBLIC_KEY,
    process.env.AUTH_JWT_PREVIOUS_KID,
  ].join("|");
  if (!cache || cache.sig !== sig) {
    const p = load();
    cache = { sig, keys: p };
    p.catch(() => {
      if (cache?.keys === p) cache = null;
    });
  }
  return cache.keys;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const k = await keys();
  return new SignJWT({ sid: claims.sid, typ: claims.typ })
    .setProtectedHeader({ alg: "EdDSA", kid: k.kid })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(k.privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const k = await keys();
  const getKey: JWTVerifyGetKey = async (header) => {
    const found = k.publics.find((p) => p.kid === header.kid);
    if (!found) throw new Error("unknown kid");
    return found.key;
  };
  const { payload } = await jwtVerify(token, getKey, {
    algorithms: ["EdDSA"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const { sub, sid, typ } = payload as Record<string, unknown>;
  if (typeof sub !== "string" || typeof sid !== "string" || (typ !== "user" && typ !== "admin")) {
    throw new Error("invalid access token claims");
  }
  return { sub, sid, typ };
}

export async function getJwks(): Promise<{ keys: JWK[] }> {
  const k = await keys();
  const out: JWK[] = [];
  for (const p of k.publics) {
    const jwk = await exportJWK(p.key);
    delete jwk.d;
    out.push({ ...jwk, kid: p.kid, alg: "EdDSA", use: "sig" });
  }
  return { keys: out };
}
