// Billing, statement and closure emails to a customer organization (decision D4).
//
// A CLIENT of an approved white-label parent receives these emails under the parent's brand, through the parent's
// verified email provider when there is one, with the legal seller line in the footer. Everything else (the
// parent's own organization, organizations without a parent, a client of a parent that is not approved, any lookup
// failure) is sent exactly as before, through our default sender with an unchanged subject and body.
// Payment links, amounts, dates and statement identifiers are never touched: only the product name in text is
// replaced.
import type { PrismaClient } from "@prisma/client";
import { resolveBrand } from "../brand.js";
import { brandFooterInner, escapeHtml, rebrandText, subjectText, type EmailBrand } from "../email-brand.js";
import { sendOrgMail, type MailLogger } from "../email/org-mail.js";
import { sendMail } from "../mail.js";
import { LEGAL_SELLER_LINE } from "./legal-seller.js";

export { LEGAL_SELLER_LINE };

export interface BillingMailContext {
  /** The recipient organization when the email follows the parent; null means "send exactly as today". */
  orgId: string | null;
  brand?: EmailBrand;
}

/**
 * Which brand and provider a billing email to `orgId` uses. `orgId` must be the organization whose contacts
 * receive the email. Branded only for a CLIENT whose parent is white-label approved. At most two queries. Never
 * throws: any failure is the default context.
 */
export async function billingMailContext(prisma: PrismaClient, orgId: string): Promise<BillingMailContext> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { parentOrganizationId: true, parentOrganization: { select: { whiteLabelEnabled: true } } },
    });
    if (!org?.parentOrganizationId || org.parentOrganization?.whiteLabelEnabled !== true) return { orgId: null };
    const brand = await resolveBrand(prisma, orgId);
    // The parent is flagged but has no usable brand (not a parent, or no brand name): today's exact email.
    if (brand.isDefault) return { orgId: null };
    return { orgId, brand };
  } catch {
    return { orgId: null };
  }
}

/** Replaces the product name in text nodes only, so tags, attributes and every link stay exactly as they are. */
function rebrandHtml(html: string, brand: EmailBrand): string {
  return html.replace(/(<[^>]*>)|([^<]+)/g, (_m, tag: string | undefined, text: string | undefined) =>
    tag !== undefined ? tag : rebrandText(text ?? "", brand));
}

function brandedFooter(brand: EmailBrand): string {
  return (
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">` +
    `${brandFooterInner(brand)}<br>Sold by ${escapeHtml(LEGAL_SELLER_LINE)}</p>`
  );
}

/** The branded subject and body: brand name instead of WBMSG, no CR/LF in the subject, legal seller line appended. */
export function brandBillingMessage(brand: EmailBrand, subject: string, html: string): { subject: string; html: string } {
  const name = subjectText(brand.name);
  return {
    subject: subjectText(subject.replace(/WBMSG/g, () => name)),
    html: rebrandHtml(html, brand) + brandedFooter(brand),
  };
}

export interface BillingMailArgs {
  /** The organization whose contacts receive this email (never the parent's id for a client's email). */
  orgId: string;
  to: string | string[];
  subject: string;
  html: string;
  logger?: MailLogger;
  /** A context already worked out for this organization (loops hoist it so the org is looked up once). */
  context?: BillingMailContext;
}

export async function sendBillingMail(prisma: PrismaClient, args: BillingMailArgs): Promise<void> {
  const ctx = args.context ?? (await billingMailContext(prisma, args.orgId));
  if (ctx.orgId === null || !ctx.brand) {
    // Exactly today's call (the same as sendOrgMail with a null org id; the recipient list stays one message).
    return sendMail({ to: args.to, subject: args.subject, html: args.html });
  }
  const { subject, html } = brandBillingMessage(ctx.brand, args.subject, args.html);
  // The provider adapters take one recipient per message, so a list becomes one message each. Every recipient is
  // attempted; the first failure is rethrown afterwards so callers keep their "email failed" handling.
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  let failure: unknown;
  let failed = false;
  for (const to of recipients) {
    try {
      await sendOrgMail(prisma, { orgId: ctx.orgId, to, subject, html, brand: ctx.brand, ...(args.logger ? { logger: args.logger } : {}) });
    } catch (err) {
      if (!failed) failure = err;
      failed = true;
    }
  }
  if (failed) throw failure;
}
