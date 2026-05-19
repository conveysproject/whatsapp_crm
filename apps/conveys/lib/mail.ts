import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Conveys <info@conveys.in>";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(options: MailOptions): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });
  if (error) throw new Error(error.message);
}

// ─── HTML Escaping ────────────────────────────────────────────────────────────

function h(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Template Builders ────────────────────────────────────────────────────────
// Pure functions — add new builders here for every new email flow.

export function buildLeadNotificationEmail(data: {
  name: string;
  email: string;
  phone?: string;
  service: string;
  message: string;
}): { subject: string; html: string } {
  const { name, email, phone, service, message } = data;
  const timestamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "long",
    timeStyle: "short",
  });

  return {
    subject: `New enquiry from ${h(name)} — ${h(service)}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#0284c7 100%);border-radius:16px 16px 0 0;padding:36px 44px 32px;">
              <span style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:100px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#bfdbfe;">New Enquiry</span>
              <h1 style="margin:12px 0 4px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Contact Form Submission</h1>
              <p style="margin:0;font-size:14px;color:#bfdbfe;">Someone filled out the contact form on conveys.in</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px 44px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;width:120px;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Name</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <span style="font-size:15px;font-weight:600;color:#0f172a;">${h(name)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Email</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <a href="mailto:${email}" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none;">${h(email)}</a>
                  </td>
                </tr>
                ${phone ? `<tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Phone</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <a href="tel:${phone}" style="font-size:15px;font-weight:600;color:#0f172a;text-decoration:none;">${h(phone)}</a>
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Service</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:100px;padding:4px 12px;font-size:13px;font-weight:700;">${h(service)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Message</span>
                  </td>
                  <td style="padding:16px 20px;vertical-align:top;">
                    <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;white-space:pre-wrap;">${h(message)}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td>
                    <a href="mailto:${email}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">Reply to ${h(name)} →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:24px 44px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">Received on ${timestamp} IST &nbsp;·&nbsp; <a href="https://conveys.in" style="color:#64748b;text-decoration:none;">conveys.in</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildAutoReplyEmail(data: {
  name: string;
  service: string;
}): { subject: string; html: string } {
  const { name, service } = data;
  return {
    subject: `We got your message, ${h(name)} 👋`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>We got your message</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HERO HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#0284c7 100%);border-radius:16px 16px 0 0;padding:48px 44px 44px;text-align:center;">
              <p style="margin:0 0 20px;font-size:13px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#93c5fd;">CONVEYS</p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.3);border-radius:50%;width:64px;height:64px;text-align:center;vertical-align:middle;">
                    <span style="font-size:30px;color:#ffffff;line-height:1;">&#10003;</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">We got your message, ${h(name)}!</h1>
              <p style="margin:0;font-size:16px;color:#bfdbfe;line-height:1.6;">Thanks for reaching out. We&#39;ve received your enquiry and we&#39;ll be in touch very soon.</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:44px;">

              <!-- SLA callout -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #bfdbfe;border-radius:12px;padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Our Promise</p>
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1e3a8a;">We respond within 24 hours</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Your enquiry about:</p>
              <p style="margin:0 0 28px;"><span style="display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:100px;padding:6px 16px;font-size:14px;font-weight:700;">${h(service)}</span></p>

              <p style="margin:0 0 32px;font-size:15px;color:#475569;line-height:1.7;">While you wait, feel free to explore our work at <a href="https://conveys.in" style="color:#1d4ed8;text-decoration:none;font-weight:600;">conveys.in</a>. If you have anything to add or need to reach us urgently, just reply to this email or use the contact details below.</p>

              <!-- Contact info -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px;">
                <tr>
                  <td style="background:#f8fafc;padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">Email Us</p>
                    <a href="mailto:info@conveys.in" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none;">info@conveys.in</a>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">Call Us</p>
                    <a href="tel:+919907072035" style="font-size:15px;font-weight:600;color:#0f172a;text-decoration:none;">+91 99070 72035</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:15px;color:#475569;">Talk soon,<br><strong style="color:#0f172a;">The Conveys Team</strong></p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:24px 44px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#334155;">Conveys Information Technology</p>
              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">SwaminarayanCity, Dombivli West, Mumbai, Maharashtra 421202</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;"><a href="https://conveys.in" style="color:#64748b;text-decoration:none;">conveys.in</a> &nbsp;·&nbsp; We Build Digital Products That Move Businesses Forward</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
