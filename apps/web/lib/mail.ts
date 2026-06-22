import nodemailer from "nodemailer";

const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];

const transporter =
  SMTP_USER && SMTP_PASS
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

export async function sendMail(options: MailOptions): Promise<void> {
  if (!transporter) {
    throw new Error("SMTP not configured (SMTP_USER/SMTP_PASS missing)");
  }
  await transporter.sendMail({
    from: `WBMSG <${SMTP_USER}>`,
    to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
    subject: options.subject,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });
}
