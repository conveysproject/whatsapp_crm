import { verifyAccessToken } from "./tokens.js";
import { isSessionRevoked } from "./sessions.js";

export type BearerIdentity = { userId: string; sid: string | null; typ: "user" | "admin" };

/**
 * Verifies the Authorization header: own access token, session must not be revoked.
 * Throws on any failure.
 */
export async function verifyBearer(authHeader: string | undefined): Promise<BearerIdentity> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing Authorization header");
  const claims = await verifyAccessToken(authHeader.slice(7));
  if (await isSessionRevoked(claims.sid)) throw new Error("Session revoked");
  return { userId: claims.sub, sid: claims.sid, typ: claims.typ };
}

function parseVersion(v: string): number[] {
  const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  return core === "" ? [] : core.split(".").map((p) => Number.parseInt(p, 10) || 0);
}

/** True when `version` is lower than `min` (numeric dotted compare). */
export function isVersionLower(version: string, min: string): boolean {
  const a = parseVersion(version);
  const b = parseVersion(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

let warnedUnparseable = false;
function warnIfUnparseable(min: string): void {
  if (warnedUnparseable || /^v?\d+(\.\d+)*([-+].*)?$/i.test(min.trim())) return;
  warnedUnparseable = true;
  console.warn("auth: AUTH_MIN_MOBILE_VERSION is set but is not a dotted version number; the mobile version gate will not work as intended");
}

/** Mobile clients below AUTH_MIN_MOBILE_VERSION (or sending no version) must upgrade. */
export function mobileUpgradeRequired(headers: Record<string, string | string[] | undefined>): boolean {
  const min = process.env.AUTH_MIN_MOBILE_VERSION;
  if (!min) return false;
  warnIfUnparseable(min);
  const client = headers["x-app-client"];
  if (typeof client !== "string" || client.toLowerCase() !== "mobile") return false;
  const version = headers["x-app-version"];
  if (typeof version !== "string" || version.trim() === "") return true;
  return isVersionLower(version, min);
}
