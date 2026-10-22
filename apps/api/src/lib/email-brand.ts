import type { PrismaClient } from "@prisma/client";
import { DEFAULT_BRAND, isAllowedAssetUrl, resolveBrand, type Brand } from "./brand.js";
import { normalizeEmail } from "../auth/ids.js";

/** What a template needs from a brand. `isDefault` marks the WBMSG default (rendered as today). */
export type EmailBrand = Pick<Brand, "name" | "logoUrl" | "supportEmail" | "hidePoweredBy"> & { isDefault?: boolean };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The brand to apply, or undefined when the email must render exactly as the unbranded WBMSG email. */
export function activeBrand(brand: EmailBrand | undefined | null): EmailBrand | undefined {
  return brand && !brand.isDefault ? brand : undefined;
}

/** Extra `sendMail` options for a brand; empty (so the call is unchanged) for the default. */
export function brandMailExtras(brand: EmailBrand | undefined | null): { fromName?: string; replyTo?: string } {
  const b = activeBrand(brand);
  if (!b) return {};
  // The web relay sanitizes again; this keeps CR/LF and brackets out of the request in the first place.
  const fromName = subjectText(b.name).slice(0, 60).trim();
  const replyTo = b.supportEmail && SAFE_EMAIL_RE.test(b.supportEmail) ? b.supportEmail : undefined;
  return { ...(fromName ? { fromName } : {}), ...(replyTo ? { replyTo } : {}) };
}

/** A brand value for a subject line: no CR/LF or other control characters, no angle brackets. */
export function subjectText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

const SAFE_EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Logo image when the URL is an allowed asset, else a text wordmark of the brand name. All values escaped. */
export function brandMark(brand: EmailBrand, wordmarkStyle: string): string {
  const name = escapeHtml(brand.name);
  if (brand.logoUrl && isAllowedAssetUrl(brand.logoUrl)) {
    return `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" height="40" style="display:block;border:0;max-height:40px;max-width:200px">`;
  }
  return `<span style="${wordmarkStyle}">${name}</span>`;
}

/** Footer line: brand name, support email as a mailto link, and (unless hidden) "Powered by WBMSG". No wbmsg.com link. */
export function brandFooterInner(brand: EmailBrand): string {
  const parts = [escapeHtml(brand.name)];
  if (brand.supportEmail && SAFE_EMAIL_RE.test(brand.supportEmail)) {
    const e = escapeHtml(brand.supportEmail);
    parts.push(`<a href="mailto:${e}" style="color:#6b7280;text-decoration:none">${e}</a>`);
  }
  let out = parts.join(" &nbsp;·&nbsp; ");
  if (!brand.hidePoweredBy) out += `<br><span style="font-size:11px;color:#9ca3af">Powered by WBMSG</span>`;
  return out;
}

/** Shell for the auth code emails when branded: logo or wordmark on top, body, brand footer. */
export function brandedShell(brand: EmailBrand, bodyHtml: string): string {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">` +
    `<div style="margin:0 0 20px">${brandMark(brand, "font-size:18px;font-weight:700;color:#1a1a1a")}</div>` +
    bodyHtml +
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">${brandFooterInner(brand)}</p>` +
    `</div>`
  );
}

/** Replaces the product name in fixed template text with the (escaped) brand name. */
export function rebrandText(text: string, brand: EmailBrand): string {
  return text.replace(/WBMSG/g, () => escapeHtml(brand.name));
}

export function brandForOrg(prisma: PrismaClient, orgId: string): Promise<Brand> {
  return resolveBrand(prisma, orgId);
}

/** The brand the recipient of an account email should see. Never throws; the default when anything is missing. */
export async function brandForAccountEmail(prisma: PrismaClient, email: string): Promise<Brand> {
  try {
    const account = await prisma.authAccount.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
    if (!account) return DEFAULT_BRAND;
    const user = await prisma.user.findUnique({ where: { id: account.id }, select: { organizationId: true } });
    if (!user?.organizationId) return DEFAULT_BRAND;
    return await resolveBrand(prisma, user.organizationId);
  } catch {
    return DEFAULT_BRAND;
  }
}
