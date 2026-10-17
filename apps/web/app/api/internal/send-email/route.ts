import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/internal-email-auth";
import { sendMail, type MailOptions } from "../../../../lib/mail";

// Generic transactional email bridge — Vercel can reach GoDaddy SMTP, Railway cannot.
//
// Two callers, one header (Authorization: Bearer <token>):
//   1. Browser (signed-in user)   — access token from getToken()  → own JWKS verify (wbmsg) or Clerk verifyToken()
//   2. Railway background workers — INTERNAL_EMAIL_SECRET hex  → verified via timingSafeEqual()

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

  const { to, subject, html, replyTo } = body as Partial<MailOptions>;

  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
  }
  if (typeof subject !== "string" || subject.length > 998) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "html too large" }, { status: 400 });
  }

  try {
    await sendMail({ to, subject, html, ...(replyTo ? { replyTo } : {}) });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-email] SMTP error:", message);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
