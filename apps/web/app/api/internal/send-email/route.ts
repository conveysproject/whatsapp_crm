import { type NextRequest, NextResponse } from "next/server";
import { sendMail, type MailOptions } from "../../../../lib/mail";

// Internal route: Railway API → Vercel SMTP bridge.
// Railway blocks outbound SMTP on all ports; this Vercel route forwards to GoDaddy.
// Security layers:
//   1. Bearer token (INTERNAL_EMAIL_SECRET) — shared secret, 32+ chars
//   2. Method guard — POST only (Next.js handles other methods with 405)
//   3. Payload size cap — rejects bodies over 64 KB
//   4. Strict field validation — no extra fields forwarded

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Require secret to be configured — fail closed
  const secret = process.env["INTERNAL_EMAIL_SECRET"];
  if (!secret || secret.length < 32) {
    console.error("[internal/send-email] INTERNAL_EMAIL_SECRET not set or too short");
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }

  // 2. Constant-time bearer token check
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Payload size cap
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // 4. Parse and validate body
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
  if (typeof html !== "string" || html.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "html too large" }, { status: 400 });
  }

  // 5. Send — only pass known fields (no pass-through of arbitrary options)
  try {
    await sendMail({ to, subject, html, ...(replyTo ? { replyTo } : {}) });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[internal/send-email] SMTP error:", message);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

// Timing-safe string comparison (prevents timing attacks on the secret)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to avoid length-based timing leak
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}
