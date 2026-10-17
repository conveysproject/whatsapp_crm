// Edge-safe: jose + atob only.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { jwksUrl } from "./config";

type Jwks = ReturnType<typeof createRemoteJWKSet>;
const jwksCache = new Map<string, Jwks>();

function getJwks(): Jwks {
  const url = jwksUrl();
  let set = jwksCache.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, set);
  }
  return set;
}

export function resetJwksForTests(): void {
  jwksCache.clear();
}

/** Unverified decode; only for refresh timing. Returns exp in ms or null. */
export function accessTokenExpiry(token: string): number | null {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    let b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(atob(b64)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sid: string; typ: "user" | "admin" } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["EdDSA"],
      issuer: "wbmsg",
      audience: "wbmsg-api",
      requiredClaims: ["exp", "sub"],
    });
    const { sub, sid, typ } = payload as { sub?: string; sid?: unknown; typ?: unknown };
    if (!sub || typeof sid !== "string" || (typ !== "user" && typ !== "admin")) return null;
    return { userId: sub, sid, typ };
  } catch {
    return null;
  }
}
