import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { sendMail, type MailOptions } from "../../../../lib/mail";

const MAX_HTML_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("[email/send] POST hit");

  const { userId } = await auth();
  console.log("[email/send] auth userId:", userId ?? "null");

  if (!userId) {
    console.log("[email/send] 401 — no Clerk session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.log("[email/send] 400 — invalid JSON");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, subject, html, replyTo } = body as Partial<MailOptions>;
  console.log("[email/send] to:", to, "subject:", subject, "html length:", typeof html === "string" ? html.length : "n/a");

  if (!to || !subject || !html) {
    console.log("[email/send] 400 — missing fields");
    return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
  }
  if (typeof subject !== "string" || subject.length > 998) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "html too large" }, { status: 400 });
  }

  console.log("[email/send] calling sendMail...");
  try {
    await sendMail({ to, subject, html, ...(replyTo ? { replyTo } : {}) });
    console.log("[email/send] sendMail OK");
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[email/send] SMTP error:", message);
    if (err instanceof Error && err.stack) {
      console.error("[email/send] stack:", err.stack);
    }
    return NextResponse.json({ error: "Failed to send email", detail: message }, { status: 500 });
  }
}
