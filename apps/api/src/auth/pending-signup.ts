import { redis } from "../lib/redis.js";
import type { BusinessInput } from "../lib/create-workspace.js";
import { normalizeEmail } from "./ids.js";

/** A sign-up waiting for its email code. The password is stored only as a hash. */
export interface PendingSignup {
  passwordHash: string;
  firstName: string;
  lastName: string;
  business: BusinessInput;
}

const TTL_SECONDS = 1800;
const key = (email: string): string => `auth:pending-signup:${normalizeEmail(email)}`;

/** "exists" means an earlier pending entry is kept (a later sign-up cannot overwrite it). */
export async function savePendingSignup(email: string, data: PendingSignup): Promise<"created" | "exists"> {
  const res = await redis.set(key(email), JSON.stringify(data), "EX", TTL_SECONDS, "NX");
  return res === "OK" ? "created" : "exists";
}

export async function loadPendingSignup(email: string): Promise<PendingSignup | null> {
  const raw = await redis.get(key(email));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSignup;
  } catch {
    return null;
  }
}

export async function deletePendingSignup(email: string): Promise<void> {
  await redis.del(key(email));
}
