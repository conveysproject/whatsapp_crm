// Sends transactional email by calling the Vercel-hosted web app's internal
// email route. Railway blocks outbound SMTP; Vercel does not.
// Requires WEB_URL and INTERNAL_EMAIL_SECRET in the API environment.

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export function isEmailConfigured(): boolean {
  return !!(process.env["WEB_URL"] && process.env["INTERNAL_EMAIL_SECRET"]);
}

export async function sendMail(options: MailOptions): Promise<void> {
  const webUrl = process.env["WEB_URL"];
  const secret = process.env["INTERNAL_EMAIL_SECRET"];

  if (!webUrl || !secret) {
    console.warn("[mail] WEB_URL or INTERNAL_EMAIL_SECRET not set — skipping email send");
    return;
  }

  const endpoint = `${webUrl.replace(/\/$/, "")}/api/internal/send-email`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(options),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Email service returned ${res.status}: ${text}`);
  }
}
