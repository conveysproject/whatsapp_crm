import { timingSafeEqual } from "crypto";

// Constant-time comparison to prevent timing attacks on the bootstrap secret
export function verifyBootstrapSecret(provided: string): boolean {
  const expected = process.env["BOOTSTRAP_SECRET"] ?? "";
  if (!expected || expected.length < 32) return false;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isBootstrapEnabled(): boolean {
  const secret = process.env["BOOTSTRAP_SECRET"] ?? "";
  return secret.length >= 32;
}
