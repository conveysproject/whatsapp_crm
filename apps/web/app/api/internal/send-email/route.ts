import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/internal-email-auth";
import { sendMail, type MailOptions } from "../../../../lib/mail";
import { isPlainEmail, isValidFromName } from "../../../../lib/mail-from";

// Generic transactional email bridge — Vercel can reach GoDaddy SMTP, Railway cannot.
//
// Server-to-server only: Authorization: Bearer <INTERNAL_EMAIL_SECRET> (Railway API),
// verified via timingSafeEqual(). User tokens are rejected in both auth modes.

const MAX_HTML_BYTES = 64 * 1024;

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
