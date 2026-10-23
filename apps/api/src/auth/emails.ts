import { sendMail } from "../lib/mail.js";
import {
  activeBrand,
  brandedShell,
  brandMailExtras,
  escapeHtml,
  rebrandText,
  subjectText,
  type EmailBrand,
} from "../lib/email-brand.js";
import type { CodePurpose } from "./codes.js";

/** Delivers a finished email. Omitted means `sendMail` with the brand's extras, exactly as before. */
export type MailDeliver = (m: { to: string; subject: string; html: string; brand: EmailBrand | undefined }) => Promise<void>;

const deliverDefault: MailDeliver = ({ to, subject, html, brand }) => sendMail({ to, subject, html, ...brandMailExtras(brand) });

const SUBJECTS: Record<CodePurpose, string> = {
  email_verify: "Verify your email for WBMSG",
  signin_email: "Your WBMSG sign-in code",
  signin_whatsapp: "Your WBMSG sign-in code",
  new_device: "Confirm a new device on WBMSG",
  password_reset: "Your WBMSG password reset code",
  phone_verify: "Your WBMSG phone verification code",
};

const LEAD: Record<CodePurpose, string> = {
  email_verify: "Use this code to verify your email address for WBMSG.",
  signin_email: "Use this code to sign in to WBMSG.",
  signin_whatsapp: "Use this code to sign in to WBMSG.",
  new_device: "Use this code to confirm a new device on your WBMSG account.",
  password_reset: "Use this code to reset your WBMSG password.",
  phone_verify: "Use this code to verify your phone number for WBMSG.",
};

function wrap(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">${body}</div>`;
}

/**
 * `lead` replaces the purpose's first line; it must be fixed text (it is inserted as HTML).
 * `brand` (the recipient's effective brand) renames and re-skins the email; omitted or default means today's WBMSG email.
 */
export async function sendCodeEmail(
  to: string,
  purpose: CodePurpose,
  code: string,
  lead?: string,
  brand?: EmailBrand,
  deliver: MailDeliver = deliverDefault,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid code format");
  const b = activeBrand(brand);
  const shell = b ? (body: string) => brandedShell(b, body) : wrap;
  const text = (t: string) => (b ? rebrandText(t, b) : t);
  const html = shell(
    `<p>${text(lead ?? LEAD[purpose])}</p>` +
      `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:24px 0">${code}</p>` +
      `<p>This code expires in 10 minutes.</p>` +
      `<p style="color:#666">If you didn't ask for this, you can ignore this email.</p>`,
  );
  // Local testing only: lets the e2e suite read codes from the API log. Never active in production.
  const env = process.env["NODE_ENV"];
  if ((env === "development" || env === "test") && process.env["AUTH_DEV_LOG_CODES"] === "1") {
    console.info(`[dev-code] ${purpose} ${to} ${code}`);
  }
  const subject = b ? SUBJECTS[purpose].replace(/WBMSG/g, () => subjectText(b.name)) : SUBJECTS[purpose];
  await deliver({ to, subject, html, brand: b });
}

export async function sendPasswordChangedEmail(to: string, brand?: EmailBrand, deliver: MailDeliver = deliverDefault): Promise<void> {
  const b = activeBrand(brand);
  const body =
    `<p>The password for your ${b ? escapeHtml(b.name) : "WBMSG"} account was just changed.</p>` +
    `<p>If this was you, no action is needed. If it wasn't, reset your password right away and contact support.</p>`;
  const html = b ? brandedShell(b, body) : wrap(body);
  const subject = b ? `Your ${subjectText(b.name)} password was changed` : "Your WBMSG password was changed";
  await deliver({ to, subject, html, brand: b });
}
