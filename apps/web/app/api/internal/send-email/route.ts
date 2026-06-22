import { type NextRequest, NextResponse } from "next/server";
import { sendMail, type MailOptions } from "../../../../lib/mail";

// Internal route called by the Railway API to send transactional emails via
// Vercel-hosted nodemailer (Railway blocks outbound SMTP; Vercel does not).
// Protected by INTERNAL_EMAIL_SECRET shared between both services.

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env["INTERNAL_EMAIL_SECRET"];
  if (!secret) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { to, subject, html, replyTo } = body as Partial<MailOptions>;
  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
  }

  try {
    await sendMail({ to, subject, html, replyTo });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[internal/send-email] SMTP error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
