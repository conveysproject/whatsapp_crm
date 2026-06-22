import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { sendMail, type MailOptions } from "../../../../lib/mail";

// Browser-facing email route — protected by Clerk middleware (not public).
// Signed-in users call this directly; no shared secret required.
// For background workers (Railway), use /api/internal/send-email instead.

const MAX_HTML_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
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
    console.error("[email/send] SMTP error:", message);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
