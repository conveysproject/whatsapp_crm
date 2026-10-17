import { sendMail } from "../lib/mail.js";
import type { CodePurpose } from "./codes.js";

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

/** `lead` replaces the purpose's first line; it must be fixed text (it is inserted as HTML). */
export async function sendCodeEmail(to: string, purpose: CodePurpose, code: string, lead?: string): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid code format");
  const html = wrap(
    `<p>${lead ?? LEAD[purpose]}</p>` +
      `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:24px 0">${code}</p>` +
      `<p>This code expires in 10 minutes.</p>` +
      `<p style="color:#666">If you didn't ask for this, you can ignore this email.</p>`,
  );
  // Local testing only: lets the e2e suite read codes from the API log. Never active in production.
  const env = process.env["NODE_ENV"];
  if ((env === "development" || env === "test") && process.env["AUTH_DEV_LOG_CODES"] === "1") {
    console.info(`[dev-code] ${purpose} ${to} ${code}`);
  }
  await sendMail({ to, subject: SUBJECTS[purpose], html });
}

export async function sendPasswordChangedEmail(to: string): Promise<void> {
  const html = wrap(
    `<p>The password for your WBMSG account was just changed.</p>` +
      `<p>If this was you, no action is needed. If it wasn't, reset your password right away and contact support.</p>`,
  );
  await sendMail({ to, subject: "Your WBMSG password was changed", html });
}
