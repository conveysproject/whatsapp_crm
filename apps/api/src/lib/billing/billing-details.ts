/** Customer billing details kept in organizations.settings.billing: where statements go and what appears on them. */
export interface BillingDetails {
  billingEmail: string;
  legalName: string;
  gstin: string;
  address: string;
}

export const EMPTY_BILLING_DETAILS: BillingDetails = { billingEmail: "", legalName: "", gstin: "", address: "" };

/** Indian GSTIN: 2-digit state code, 10-character PAN, entity number, "Z", check character. Case-insensitive input. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function str(v: unknown): string | null {
  return typeof v === "string" ? v.trim() : null;
}

/** Validates a submitted update. Every field is optional text; an empty string clears it. */
export function parseBillingDetails(raw: unknown): { ok: true; details: BillingDetails } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "details must be an object" };
  const o = raw as Record<string, unknown>;
  const billingEmail = str(o["billingEmail"]);
  const legalName = str(o["legalName"]);
  const gstinRaw = str(o["gstin"]);
  const address = str(o["address"]);
  if (billingEmail === null || legalName === null || gstinRaw === null || address === null) return { ok: false, error: "all fields must be text" };
  if (billingEmail.length > 254 || (billingEmail !== "" && !EMAIL_RE.test(billingEmail))) return { ok: false, error: "billingEmail must be a valid email address" };
  if (legalName.length > 120) return { ok: false, error: "legalName must be at most 120 characters" };
  if (address.length > 300) return { ok: false, error: "address must be at most 300 characters" };
  const gstin = gstinRaw.toUpperCase();
  if (gstin !== "" && !GSTIN_RE.test(gstin)) return { ok: false, error: "gstin must be a valid 15-character GST number" };
  return { ok: true, details: { billingEmail, legalName, gstin, address } };
}

/** Reads the stored details from organization settings, tolerating missing or malformed data. */
export function readBillingDetails(settings: unknown): BillingDetails {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return EMPTY_BILLING_DETAILS;
  const b = (settings as Record<string, unknown>)["billing"];
  if (!b || typeof b !== "object" || Array.isArray(b)) return EMPTY_BILLING_DETAILS;
  const r = b as Record<string, unknown>;
  const pick = (k: string): string => (typeof r[k] === "string" ? (r[k] as string) : "");
  return { billingEmail: pick("billingEmail"), legalName: pick("legalName"), gstin: pick("gstin"), address: pick("address") };
}

/** Statement emails go to the billing email when one is set, otherwise to the organization's admins. */
export function statementRecipients(details: BillingDetails, adminEmails: string[]): string[] {
  return details.billingEmail ? [details.billingEmail] : adminEmails;
}
