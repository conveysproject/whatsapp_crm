export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
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
