import Razorpay from "razorpay";
import { getStripe } from "../stripe.js";

export type StatementCurrency = "INR" | "USD";
export type PaymentProvider = "razorpay" | "stripe";

/** INR for an Indian number (+91 and ten digits), USD for everyone else or when the number is unknown. */
export function currencyForPhone(phone: string | null | undefined): StatementCurrency {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? "INR" : "USD";
}

export interface OrgCurrencyHints {
  settings: unknown;
  location: string | null | undefined;
  phone: string | null | undefined;
}

/**
 * The currency a customer is billed in: the owner's explicit choice (settings.billingCurrency) wins; otherwise a location
 * that mentions India, then an Indian phone number, then USD. Reliable only through the explicit choice, which the owner
 * can set per organization in Admin > Billing.
 */
export function currencyForOrg(org: OrgCurrencyHints): StatementCurrency {
  const s = org.settings;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    const v = (s as Record<string, unknown>)["billingCurrency"];
    if (v === "INR" || v === "USD") return v;
  }
  if (typeof org.location === "string" && /\bindia\b/i.test(org.location)) return "INR";
  return currencyForPhone(org.phone);
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
 * Creates a single-use payment link for one statement with the platform's own gateway keys (never a customer's).
 * INR goes through Razorpay, USD through Stripe. Throws when the gateway is not configured or refuses.
 */
export async function createStatementPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("amount must be positive");
  const notes = { statementId: input.statementId, organizationId: input.organizationId, kind: "usage_statement" };

  if (input.currency === "INR") {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const link = await rzp.paymentLink.create({
      amount: input.amountMinor,
      currency: "INR",
      accept_partial: false,
      reference_id: input.statementId,
      description: input.description,
      ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes,
      expire_by: Math.floor((input.dueAt.getTime() + LINK_LIFETIME_DAYS * 86_400_000) / 1000),
    } as never) as unknown as { id?: string; short_url?: string };
    if (!link.id || !link.short_url) throw new Error("Razorpay returned no link");
    return { provider: "razorpay", url: link.short_url, ref: link.id };
  }

  const link = await getStripe().paymentLinks.create({
    line_items: [{ price_data: { currency: "usd", product_data: { name: input.description }, unit_amount: input.amountMinor }, quantity: 1 }],
    metadata: notes,
    // One successful payment, then the link stops accepting more.
    restrictions: { completed_sessions: { limit: 1 } },
  } as never);
  if (!link.id || !link.url) throw new Error("Stripe returned no link");
  return { provider: "stripe", url: link.url, ref: link.id };
}

/**
 * Stops a payment link from accepting money (used when the owner voids a statement or records it as paid by hand, so a
 * customer cannot pay it a second time). Best effort: the caller logs a failure and carries on.
 */
export async function cancelStatementPaymentLink(provider: string | null, ref: string | null): Promise<void> {
  if (!provider || !ref) return;
  if (provider === "razorpay") {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
    await new Razorpay({ key_id: keyId, key_secret: keySecret }).paymentLink.cancel(ref);
  } else if (provider === "stripe") {
    await getStripe().paymentLinks.update(ref, { active: false });
  }
}
