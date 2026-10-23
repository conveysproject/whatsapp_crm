import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/internal-email-auth";
import { sendMail, type MailOptions } from "../../../../lib/mail";
import { isPlainEmail, isValidFromName } from "../../../../lib/mail-from";
import { isValidSmtpSettings, sendViaSmtp, type SmtpSettings } from "../../../../lib/smtp-send";

// SMTP mode connects to a customer host (10 s connect + 10 s greeting + 20 s socket timeouts);
// without this Vercel would cut the function at its default limit.
export const maxDuration = 30;

// Generic transactional email bridge — Vercel can reach GoDaddy SMTP, Railway cannot.
//
// Server-to-server only: Authorization: Bearer <INTERNAL_EMAIL_SECRET> (Railway API),
// verified via timingSafeEqual(). User tokens are rejected in both auth modes.

const MAX_HTML_BYTES = 64 * 1024;
const SMTP_BODY_KEYS = new Set(["to", "subject", "html", "replyTo", "fromName", "smtp"]);
const SMTP_KEYS = new Set(["host", "port", "security", "allowPlain", "user", "pass", "fromAddress"]);
const hasOnly = (o: object, allowed: Set<string>): boolean => Object.keys(o).every((k) => allowed.has(k));

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!await isAuthorized(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body === "object" && body !== null && "smtp" in body) {
    return sendThroughClientSmtp(body as Record<string, unknown>);
  }

  const { to, subject, html, replyTo, fromName } = body as Partial<MailOptions>;

  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
  }
  if (typeof subject !== "string" || subject.length > 998) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "html too large" }, { status: 400 });
  }

  if (fromName !== undefined && !isValidFromName(fromName)) {
    return NextResponse.json({ error: "Invalid fromName" }, { status: 400 });
  }
  if (replyTo !== undefined && replyTo !== "" && !isPlainEmail(replyTo)) {
    return NextResponse.json({ error: "Invalid replyTo" }, { status: 400 });
  }

  try {
    await sendMail({
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(fromName !== undefined ? { fromName } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-email] SMTP error:", message);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

/**
 * Client SMTP mode. Only reached after the bearer secret was verified. The smtp object, the password
 * and the SMTP server's text are never logged or returned; failures carry a fixed reason only.
 */
async function sendThroughClientSmtp(body: Record<string, unknown>): Promise<NextResponse> {
  const { to, subject, html, replyTo, fromName, smtp } = body;
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

  if (!hasOnly(body, SMTP_BODY_KEYS)) return bad("Unknown fields");
  if (typeof smtp !== "object" || smtp === null || Array.isArray(smtp) || !hasOnly(smtp, SMTP_KEYS) || !isValidSmtpSettings(smtp)) {
    return bad("Invalid smtp settings");
  }
  if (!isPlainEmail(to)) return bad("to must be a single email address");
  if (typeof subject !== "string" || subject.length < 1 || subject.length > 998) return bad("Invalid subject");
  if (typeof html !== "string" || html.length < 1 || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) return bad("Invalid html");
  if (fromName !== undefined && !isValidFromName(fromName)) return bad("Invalid fromName");
  if (replyTo !== undefined && replyTo !== "" && !isPlainEmail(replyTo)) return bad("Invalid replyTo");

  let result: Awaited<ReturnType<typeof sendViaSmtp>>;
  try {
    result = await sendViaSmtp(smtp as SmtpSettings, {
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(fromName !== undefined ? { fromName } : {}),
    });
  } catch {
    result = { ok: false, retryable: true, reason: "send failed" };
  }
  if (result.ok) return NextResponse.json({ ok: true });
  console.error("[send-email] client SMTP send failed:", result.reason);
  return NextResponse.json({ ok: false, retryable: result.retryable, reason: result.reason }, { status: 502 });
}
