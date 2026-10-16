import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"; // RFC 4648 base32, lowercase

function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** New auth account ID: `usr_` + 26 base32 chars (130 bits from a CSPRNG). */
export function newAccountId(): string {
  // 17 bytes = 136 bits -> 28 chars; keep the first 26.
  return `usr_${base32(randomBytes(17)).slice(0, 26)}`;
}

/** Normalize an email for storage/lookup: trim + lowercase only (no Gmail dot/plus folding). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
