import { checkRateLimit } from "../../../lib/rate-limit";
import {
  sendMail,
  buildLeadNotificationEmail,
  buildAutoReplyEmail,
} from "../../../lib/mail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  const ip =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many requests, please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, phone, service, message } = body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !service?.trim() || !message?.trim()) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (message.length > 2000) {
    return Response.json(
      { error: "Message is too long (max 2000 characters)." },
      { status: 400 },
    );
  }

  const toEmail = process.env.CONTACT_TO_EMAIL ?? "info@conveys.in";

  try {
    await Promise.all([
      sendMail({
        to: toEmail,
        replyTo: email,
        ...buildLeadNotificationEmail({ name, email, phone, service, message }),
      }),
      sendMail({
        to: email,
        ...buildAutoReplyEmail({ name, service }),
      }),
    ]);
  } catch {
    return Response.json(
      { error: "Something went wrong, please try again." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
