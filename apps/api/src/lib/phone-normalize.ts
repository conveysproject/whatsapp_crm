import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function normalizeFullPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const e164 = `+${digits}`;
  return isValidE164(e164) ? e164 : null;
}

export function normalizeSplitPhone(countryCode: string, phone: string): string | null {
  const cc = countryCode.replace(/\D/g, "");
  const ph = phone.replace(/\D/g, "");
  if (!cc || !ph) return null;
  const e164 = `+${cc}${ph}`;
  return isValidE164(e164) ? e164 : null;
}

// GAP-S08: return a list of candidate phone variants to try when exact match fails.
// Covers the most common cases: +91XXX vs 91XXX vs 0XXX for any country.
export function phoneVariants(raw: string): string[] {
  const variants = new Set<string>();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  // Original as-is (E.164 if starts with +, or try with +)
  if (raw.startsWith("+")) {
    variants.add(raw);
    variants.add(digits); // without +
  } else {
    variants.add(raw);
    variants.add(`+${digits}`); // with +
  }

  // Try libphonenumber to canonicalize
  try {
    const candidate = raw.startsWith("+") ? raw : `+${digits}`;
    if (isValidPhoneNumber(candidate)) {
      const parsed = parsePhoneNumber(candidate);
      if (parsed) {
        variants.add(parsed.format("E.164"));
        variants.add(parsed.nationalNumber);
        variants.add(String(parsed.countryCallingCode) + parsed.nationalNumber);
      }
    }
  } catch { /* ignore parse errors */ }

  return [...variants].filter((v) => v.length >= 7);
}
