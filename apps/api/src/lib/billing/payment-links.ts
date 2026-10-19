import Razorpay from "razorpay";

export type StatementCurrency = "INR" | "USD";
export type PaymentProvider = "razorpay";

/** INR for an Indian number (+91 and ten digits), USD for everyone else or when the number is unknown. */
export function currencyForPhone(phone: string | null | undefined): StatementCurrency {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? "INR" : "USD";
}

export interface OrgCurrencyHints {
  settings: unknown;
  location: string | null | undefined;
  /** The organization's connected WhatsApp number (verified by Meta); null when none is connected. */
  wabaPhone: string | null | undefined;
}

/** Vendor setting that holds the connected WhatsApp number's display form, e.g. "+91 98765 43210". */
const WABA_PHONE_KEY = "current_phone_number_number";

/** Organization fields needed to pick the billing currency (use as, or inside, a Prisma `select`). */
export const ORG_CURRENCY_SELECT = {
  settings: true,
  location: true,
  vendorSettings: { where: { key: WABA_PHONE_KEY }, select: { value: true }, take: 1 },
} as const;

export function orgCurrencyHints(org: { settings: unknown; location: string | null; vendorSettings?: Array<{ value: string | null }> }): OrgCurrencyHints {
  return { settings: org.settings, location: org.location, wabaPhone: org.vendorSettings?.[0]?.value ?? null };
}

/**
 * The currency a customer is billed in: the owner's explicit choice (settings.billingCurrency) wins; otherwise the country
 * of the connected WhatsApp number (+91 = INR, any other = USD), then a location that mentions India, then USD. The
 * Account Details phone is typed by the customer and never used. The owner can set the choice per organization in Admin > Billing.
 */
export function currencyForOrg(org: OrgCurrencyHints): StatementCurrency {
  const s = org.settings;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    const v = (s as Record<string, unknown>)["billingCurrency"];
    if (v === "INR" || v === "USD") return v;
  }
  if ((org.wabaPhone ?? "").replace(/\D/g, "")) return currencyForPhone(org.wabaPhone);
  if (typeof org.location === "string" && /\bindia\b/i.test(org.location)) return "INR";
  return "USD";
}

export interface PaymentLinkInput {
  statementId: string;
  organizationId: string;
  currency: StatementCurrency;
  /** Minor units: paise or cents. */
  amountMinor: number;
  description: string;
  dueAt: Date;
  customerEmail?: string | null;
}

export interface PaymentLink {
  provider: PaymentProvider;
  url: string;
  /** The gateway's id of the link. A webhook is accepted only when it names this exact link. */
  ref: string;
}

const LINK_LIFETIME_DAYS = 60;

/**
 * Creates a single-use Razorpay payment link for one statement with the platform's own keys (never a customer's), in
 * INR or USD. A USD link needs Razorpay's international payments to be activated on the account; until then Razorpay
 * refuses and this throws, and the statement simply has no link yet (retried daily). Throws when keys are missing.
 */
export async function createStatementPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("amount must be positive");
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const link = await rzp.paymentLink.create({
    amount: input.amountMinor,
    currency: input.currency,
    accept_partial: false,
    reference_id: input.statementId,
    description: input.description,
    ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { statementId: input.statementId, organizationId: input.organizationId, kind: "usage_statement" },
    expire_by: Math.floor((input.dueAt.getTime() + LINK_LIFETIME_DAYS * 86_400_000) / 1000),
  } as never) as unknown as { id?: string; short_url?: string };
  if (!link.id || !link.short_url) throw new Error("Razorpay returned no link");
  return { provider: "razorpay", url: link.short_url, ref: link.id };
}

/**
 * Stops a payment link from accepting money (used when the owner voids a statement or records it as paid by hand, so a
 * customer cannot pay it a second time). Best effort: the caller logs a failure and carries on.
 */
export async function cancelStatementPaymentLink(provider: string | null, ref: string | null): Promise<void> {
  if (!provider || !ref || provider !== "razorpay") return;
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  await new Razorpay({ key_id: keyId, key_secret: keySecret }).paymentLink.cancel(ref);
}
