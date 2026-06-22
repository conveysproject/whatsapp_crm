import { verifyToken } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { sendMail, type MailOptions } from "../../../../lib/mail";

// Generic transactional email bridge — Vercel can reach GoDaddy SMTP, Railway cannot.
//
// Two callers, one header (Authorization: Bearer <token>):
//   1. Browser (signed-in user)   — Clerk JWT from getToken()  → verified via verifyToken()
//   2. Railway background workers — INTERNAL_EMAIL_SECRET hex  → verified via timingSafeEqual()
//
// Route is public in middleware so Railway can reach it without a Clerk session.
// verifyToken() verifies Clerk JWTs directly without needing middleware context.

const MAX_HTML_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("[send-email] POST hit");

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const authorized = await isAuthorized(token);
  console.log("[send-email] authorized:", authorized, "token prefix:", token.slice(0, 6) || "(empty)");

  if (!authorized) {
    console.log("[send-email] 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, subject, html, replyTo } = body as Partial<MailOptions>;
  console.log("[send-email] to:", to, "subject:", subject);

  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
  }
  if (typeof subject !== "string" || subject.length > 998) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "html too large" }, { status: 400 });
  }

  console.log("[send-email] calling sendMail...");
  try {
    await sendMail({ to, subject, html, ...(replyTo ? { replyTo } : {}) });
    console.log("[send-email] sendMail OK");
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-email] SMTP error:", message);
    return NextResponse.json({ error: "Failed to send email", detail: message }, { status: 500 });
  }
}

async function isAuthorized(token: string): Promise<boolean> {
  if (!token) return false;

  // Method 1: Clerk JWT — verify directly, no middleware context needed
  if (token.startsWith("eyJ")) {
    const secretKey = process.env["CLERK_SECRET_KEY"];
    if (secretKey) {
      try {
        const payload = await verifyToken(token, { secretKey });
        if (payload?.sub) {
          console.log("[send-email] Clerk JWT ok, sub:", payload.sub);
          return true;
        }
      } catch (e) {
        console.log("[send-email] Clerk JWT invalid:", (e as Error).message);
      }
    }
  }

  // Method 2: internal secret for Railway background workers
  const secret = process.env["INTERNAL_EMAIL_SECRET"];
  if (secret && secret.length >= 32) {
    const ok = timingSafeEqual(token, secret);
    if (ok) console.log("[send-email] internal secret ok");
    return ok;
  }

  return false;
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
