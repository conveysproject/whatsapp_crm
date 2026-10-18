import { normalizeFullPhone } from "../lib/phone-normalize.js";

/** E.164 (`+` and digits) for a full international number, or null when it is not a valid number. */
export function toE164(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const digits = normalizeFullPhone(raw);
  return digits && digits.length <= 15 ? `+${digits}` : null;
}
