import { isValidPhoneNumber } from "libphonenumber-js";

// Validates a phone string that contains only digits (no + prefix).
// Uses libphonenumber-js so partial numbers without a real country code are rejected.
export function isValidPhone(digits: string): boolean {
  if (!digits) return false;
  try {
    return isValidPhoneNumber("+" + digits);
  } catch {
    return false;
  }
}

// Strips all non-digit characters (including +, spaces, dashes, Excel ="..." wrapper),
// then validates as a full international number. Returns plain digits or null.
export function normalizeFullPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return isValidPhone(digits) ? digits : null;
}

export function normalizeSplitPhone(countryCode: string, phone: string): string | null {
  const cc = countryCode.replace(/\D/g, "");
  const ph = phone.replace(/\D/g, "");
  if (!cc || !ph) return null;
  const digits = cc + ph;
  return isValidPhone(digits) ? digits : null;
}

// GAP-S08: return a list of candidate phone variants to try when exact match fails.
// Used during transition periods only — once all data is normalized, exact match suffices.
export function phoneVariants(raw: string): string[] {
  const variants = new Set<string>();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  variants.add(digits);

  // Also include with + stripped (handles legacy +91xxx stored in DB)
  if (raw.startsWith("+")) variants.add(digits);
  else variants.add(`+${digits}`); // legacy format that may exist in DB pre-migration

  return [...variants].filter((v) => v.length >= 7);
}
