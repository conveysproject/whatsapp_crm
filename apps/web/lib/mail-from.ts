// Header-injection-safe sender name and reply-to checks for the internal email relay.

const MAX_NAME = 60;
const FALLBACK_NAME = "WBMSG";

/**
 * Makes a display name safe for the From header: drops control characters (CR, LF, NUL ...),
 * quotes, angle brackets, backslashes, commas and semicolons; collapses whitespace; max 60 chars.
 * Falls back to "WBMSG" when nothing usable is left.
 */
export function sanitizeFromName(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_NAME;
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/["<>\\,;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
  return cleaned || FALLBACK_NAME;
}

/** A fromName the route accepts: a string of 1-60 characters after trimming. */
export function isValidFromName(v: unknown): v is string {
  return typeof v === "string" && v.trim().length >= 1 && v.trim().length <= MAX_NAME;
}

/** A single plain address: no CR/LF, whitespace, commas, semicolons, angle brackets, quotes or parentheses. */
const PLAIN_EMAIL = /^[^\s@,;<>"'()[\]\\:]+@[^\s@,;<>"'()[\]\\:]+\.[^\s@,;<>"'()[\]\\:]+$/;
export function isPlainEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && PLAIN_EMAIL.test(v);
}

/** nodemailer address object form, so the name is never concatenated into the header by hand. */
export function buildFrom(fromName: unknown, address: string): { name: string; address: string } {
  return { name: sanitizeFromName(fromName), address };
}
