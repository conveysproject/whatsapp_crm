import { createHash, randomBytes } from "node:crypto";
import { redis } from "../../lib/redis.js";
import type { OAuthProviderId } from "./types.js";

const STATE_TTL_S = 600;
const PENDING_TTL_S = 1800;
const stateKey = (s: string) => `auth:oauth:state:${s}`;
const pendingKey = (id: string) => `auth:oauth:pending:${id}`;

/** 256-bit URL-safe random id (state values, pending ids, PKCE verifiers, nonces). */
export function newOpaqueId(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Only same-site absolute paths survive; anything else becomes /dashboard. The BFF re-checks it. */
export function safeRelativePath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 512) return "/dashboard";
  // eslint-disable-next-line no-control-regex
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) {
    return "/dashboard";
  }
  return raw;
}

export interface OAuthState {
  provider: OAuthProviderId;
  intent: "signin" | "link";
  accountId: string | null;
  codeVerifier: string;
  nonce: string;
  redirectUrl: string;
}

export async function saveOAuthState(state: string, data: OAuthState): Promise<void> {
  await redis.set(stateKey(state), JSON.stringify(data), "EX", STATE_TTL_S);
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isProvider = (v: unknown): v is OAuthProviderId => v === "google" || v === "facebook";

function parse<T>(raw: string | null, ok: (v: Record<string, unknown>) => boolean): T | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && ok(v as Record<string, unknown>) ? (v as T) : null;
  } catch {
    return null;
  }
}

/** Single use: the state is deleted as it is read, so a replayed callback finds nothing. */
export async function consumeOAuthState(state: string): Promise<OAuthState | null> {
  const raw = await redis.getdel(stateKey(state));
  return parse<OAuthState>(raw, (v) =>
    isProvider(v["provider"]) &&
    (v["intent"] === "signin" || (v["intent"] === "link" && isStr(v["accountId"]))) &&
    isStr(v["codeVerifier"]) &&
    isStr(v["nonce"]) &&
    isStr(v["redirectUrl"]),
  );
}

/** A provider identity waiting for an email code before it is linked to (or creates) an account. */
export interface PendingOAuth {
  provider: OAuthProviderId;
  sub: string;
  /** The provider's email (normalized), or null when it gave none. */
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  redirectUrl: string;
  /** Set once a code was sent: the address it went to and the code row it must match. */
  target?: string;
  codeId?: string;
}

export async function savePendingOAuth(id: string, data: PendingOAuth): Promise<void> {
  await redis.set(pendingKey(id), JSON.stringify(data), "EX", PENDING_TTL_S);
}

export async function loadPendingOAuth(id: string): Promise<PendingOAuth | null> {
  const raw = await redis.get(pendingKey(id));
  return parse<PendingOAuth>(raw, (v) => isProvider(v["provider"]) && isStr(v["sub"]) && isStr(v["redirectUrl"]));
}

export async function deletePendingOAuth(id: string): Promise<void> {
  await redis.del(pendingKey(id));
}
