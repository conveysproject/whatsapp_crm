import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { sendMail, type MailOptions } from "../../../../lib/mail";

// Generic transactional email bridge — Vercel can reach GoDaddy SMTP, Railway cannot.
//
// Two callers, two auth methods:
//   1. Browser (signed-in user) — Clerk session cookie, no extra header needed
//   2. Railway background workers — Authorization: Bearer INTERNAL_EMAIL_SECRET
//
// Both are checked here; if neither passes → 401.

const MAX_HTML_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!await isAuthorized(request)) {
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

async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Method 1: signed-in Clerk session (browser calls from the web app)
  try {
    const { userId } = await auth();
    if (userId) return true;
  } catch { /* not a Clerk request — fall through */ }

  // Method 2: internal secret (Railway background workers)
  const secret = process.env["INTERNAL_EMAIL_SECRET"];
  if (!secret || secret.length < 32) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return timingSafeEqual(provided, secret);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}
