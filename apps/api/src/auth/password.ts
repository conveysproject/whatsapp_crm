import { hash, verify, type Algorithm } from "@node-rs/argon2";

const PARAMS = {
  algorithm: 2 as Algorithm, // Argon2id (const enum is unusable under isolatedModules)
  memoryCost: 65536, // KiB
  timeCost: 3,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, PARAMS);
}

/** True when the PHC string is not argon2id with exactly the current m/t/p. */
function paramsDiffer(phc: string): boolean {
  const m = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  if (!m) return true;
  return (
    Number(m[1]) !== PARAMS.memoryCost ||
    Number(m[2]) !== PARAMS.timeCost ||
    Number(m[3]) !== PARAMS.parallelism
  );
}

export async function verifyPassword(
  plain: string,
  storedHash: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  let ok = false;
  try {
    ok = await verify(storedHash, plain);
  } catch {
    return { ok: false, needsRehash: false };
  }
  return { ok, needsRehash: ok && paramsDiffer(storedHash) };
}

export function checkPasswordPolicy(
  plain: string,
): { ok: true } | { ok: false; reason: "too_short" | "too_long" } {
  if (plain.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: "too_short" };
  if (plain.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true };
}
