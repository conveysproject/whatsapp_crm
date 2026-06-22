import nodemailer from "nodemailer";

const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];
const SMTP_HOST = process.env["SMTP_HOST"] ?? "smtpout.secureserver.net";
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "465", 10);

console.log("[mail] module init — SMTP_USER:", SMTP_USER ?? "UNSET", "SMTP_HOST:", SMTP_HOST, "SMTP_PORT:", SMTP_PORT, "SMTP_PASS set:", !!SMTP_PASS);

const transporter =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

console.log("[mail] transporter:", transporter ? "created" : "NULL — SMTP_USER or SMTP_PASS missing");

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(options: MailOptions): Promise<void> {
  console.log("[mail] sendMail start — to:", options.to, "subject:", options.subject);
  if (!transporter) {
    console.error("[mail] sendMail FAILED — transporter is null. SMTP_USER:", SMTP_USER ?? "UNSET", "SMTP_PASS set:", !!SMTP_PASS);
    throw new Error("SMTP not configured (SMTP_USER/SMTP_PASS missing)");
  }
  try {
    const info = await transporter.sendMail({
      from: `WBMSG <${SMTP_USER}>`,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });
    console.log("[mail] sendMail OK — messageId:", info.messageId, "response:", info.response);
  } catch (err: unknown) {
    console.error("[mail] sendMail SMTP error:", (err as Error).message);
    throw err;
  }
}
