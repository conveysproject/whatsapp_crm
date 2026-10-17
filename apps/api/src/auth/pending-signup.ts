import { redis } from "../lib/redis.js";
import type { BusinessInput } from "../lib/create-workspace.js";

/** A sign-up waiting for its email code, bound to the browser that started it by its signupId. */
export interface PendingSignup {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  business: BusinessInput;
}

const TTL_SECONDS = 1800;
const key = (signupId: string): string => `auth:pending-signup:${signupId}`;

export async function savePendingSignup(signupId: string, data: PendingSignup): Promise<void> {
  await redis.set(key(signupId), JSON.stringify(data), "EX", TTL_SECONDS);
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Null when missing or when the stored JSON does not have the expected shape. */
export async function loadPendingSignup(signupId: string): Promise<PendingSignup | null> {
  const raw = await redis.get(key(signupId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return null;
    const b = v["business"] as Record<string, unknown> | null;
    if (!isStr(v["email"]) || !isStr(v["passwordHash"]) || !isStr(v["firstName"]) || !isStr(v["lastName"])) return null;
    if (!b || typeof b !== "object" || !isStr(b["companyName"]) || !isStr(b["industry"]) || !isStr(b["revenue"])) return null;
    return v as unknown as PendingSignup;
  } catch {
    return null;
  }
}

export async function deletePendingSignup(signupId: string): Promise<void> {
  await redis.del(key(signupId));
}
