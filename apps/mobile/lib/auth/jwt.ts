const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlToBytes(input: string): number[] | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input.replace(/=+$/, "")) {
    const value = ALPHABET.indexOf(ch === "+" ? "-" : ch === "/" ? "_" : ch);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Reads a JWT's claims WITHOUT verifying it. Only for the app's own bookkeeping (user id); the API verifies every token. */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  const bytes = base64UrlToBytes(parts[1]);
  if (!bytes) return null;
  try {
    const text = decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
    const claims: unknown = JSON.parse(text);
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
