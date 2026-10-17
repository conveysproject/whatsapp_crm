// Pure helpers for the two-screen sign-up: per-screen validation and request building.
export interface IdentityValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface BusinessValues {
  companyName: string;
  companyWebsite: string;
  companyLocation: string;
  industry: string;
  subCategory: string;
  revenue: string;
  termsAccepted: boolean;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateIdentityScreen(v: IdentityValues): FieldErrors<IdentityValues> {
  const e: FieldErrors<IdentityValues> = {};
  const first = v.firstName.trim();
  const last = v.lastName.trim();
  if (first.length < 1 || first.length > 100) e.firstName = "Enter your first name (up to 100 characters).";
  if (last.length < 1 || last.length > 100) e.lastName = "Enter your last name (up to 100 characters).";
  if (!EMAIL_RE.test(v.email.trim())) e.email = "Enter a valid email address.";
  if (v.password.length < 8 || v.password.length > 128) e.password = "Use 8 to 128 characters.";
  return e;
}

/** `requireCompanyName` is false only for the Clerk business-details page, where the org name is used. */
export function validateBusinessScreen(
  v: BusinessValues,
  opts: { requireCompanyName?: boolean } = {},
): FieldErrors<BusinessValues> {
  const e: FieldErrors<BusinessValues> = {};
  if ((opts.requireCompanyName ?? true) && !v.companyName.trim()) e.companyName = "Company name is required";
  if (!v.companyWebsite.trim()) e.companyWebsite = "Company website is required";
  if (!v.companyLocation.trim()) e.companyLocation = "Company location is required";
  if (!v.industry) e.industry = "Please select your industry";
  if (!v.subCategory) e.subCategory = "Please select a category";
  if (!v.revenue) e.revenue = "Please select annual revenue";
  if (!v.termsAccepted) e.termsAccepted = "You must accept the terms to continue";
  return e;
}

export function buildSignUpBody(
  identity: IdentityValues,
  business: BusinessValues,
  turnstileToken: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: identity.email.trim(),
    password: identity.password,
    firstName: identity.firstName.trim(),
    lastName: identity.lastName.trim(),
    business: {
      companyName: business.companyName.trim(),
      companyWebsite: business.companyWebsite.trim(),
      companyLocation: business.companyLocation.trim(),
      industry: business.industry,
      subCategory: business.subCategory,
      revenue: business.revenue,
    },
  };
  if (turnstileToken) body["turnstileToken"] = turnstileToken;
  return body;
}

/** The signupId to keep after a sign-up (re)send: the new one on success, otherwise the previous one. */
export function nextSignupId(previous: string | null, result: { status: number; body: unknown }): string | null {
  if (result.status < 200 || result.status >= 300) return previous;
  const id = (result.body as { signupId?: unknown } | null)?.signupId;
  return typeof id === "string" && id ? id : previous;
}
