import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_VAR = "EMAIL_SETTINGS_KEY";
const INVALID = "Invalid encrypted value";

export class SecretBoxKeyError extends Error {}

// Read at call time so the module can be imported before the variable is set.
function key(): Buffer {
  const k = Buffer.from(process.env[KEY_VAR] ?? "", "base64");
  if (k.length !== 32) throw new SecretBoxKeyError(`${KEY_VAR} must be 32 bytes, base64-encoded`);
  return k;
}

/** AES-256-GCM. Format: v1.base64(iv).base64(tag).base64(ciphertext). */
export function encryptJson(value: unknown): string {
  const k = key();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(".");
}

/** Any failure other than a missing/bad key throws the same generic error. */
export function decryptJson<T = unknown>(blob: string): T {
  const k = key();
  try {
    const parts = blob.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) throw new Error();
    const iv = Buffer.from(parts[1] as string, "base64");
    const tag = Buffer.from(parts[2] as string, "base64");
    const ct = Buffer.from(parts[3] as string, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as T;
  } catch {
    throw new Error(INVALID);
  }
}
