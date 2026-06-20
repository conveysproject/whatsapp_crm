import nodemailer from "nodemailer";

// Transactional email via authenticated SMTP (mirrors apps/conveys/lib/mail.ts).
// Configure SMTP_USER / SMTP_PASS in the API environment. When unset, sendMail
// is a safe no-op (logs a warning) so nothing is sent in dev/CI by accident.
const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];

const transporter = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: process.env["SMTP_HOST"] ?? "smtpout.secureserver.net",
      port: parseInt(process.env["SMTP_PORT"] ?? "465", 10),
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export function isEmailConfigured(): boolean {
  return transporter !== null;
}

export async function sendMail(options: MailOptions): Promise<void> {
  if (!transporter) {
    console.warn("[mail] SMTP not configured (SMTP_USER/SMTP_PASS) — skipping email send");
    return;
  }
  await transporter.sendMail({
    from: `WBMSG <${SMTP_USER}>`,
    to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
    subject: options.subject,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });
}
