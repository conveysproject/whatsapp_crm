function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const INVITATION_SUBJECT = "You've been invited to join WBMSG";

export function invitationAcceptUrl(token: string): string {
  const base = (process.env["WEB_URL"] ?? "https://wbmsg.com").replace(/\/$/, "");
  return `${base}/invitations/${encodeURIComponent(token)}/accept`;
}

export function buildInvitationEmail({ role, acceptUrl }: { role: string; acceptUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <tr><td style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);border-radius:16px 16px 0 0;padding:40px 44px;text-align:center">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#a7f3d0">WBMSG</p>
          <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#fff">You've been invited!</h1>
          <p style="margin:0;font-size:15px;color:#d1fae5;line-height:1.5">
            You've been invited to join as <strong>${escapeHtml(role)}</strong>.<br>
            Accept below to create your account and get started.
          </p>
        </td></tr>

        <tr><td style="background:#fff;padding:40px 44px;text-align:center">
          <a href="${escapeHtml(acceptUrl)}"
             style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.01em">
            Accept Invitation →
          </a>
          <p style="margin:28px 0 0;font-size:13px;color:#9ca3af">
            This invitation expires in 7 days.<br>
            If you didn't expect this email, you can safely ignore it.
          </p>
        </td></tr>

        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 44px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">
            WBMSG — WhatsApp-first CRM &nbsp;·&nbsp;
            <a href="https://wbmsg.com" style="color:#6b7280;text-decoration:none">wbmsg.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const CLIENT_INVITATION_SUBJECT = "You've been invited to create a WBMSG account";

export function clientInvitationAcceptUrl(token: string): string {
  const base = (process.env["WEB_URL"] ?? "https://wbmsg.com").replace(/\/$/, "");
  return `${base}/client-invitations/${encodeURIComponent(token)}/accept`;
}

// Same layout as buildInvitationEmail; D12: the invitee must be told the parent gets full read access.
// Each replacement must change the string, so a reworded base template fails loudly instead of
// silently dropping the read-access notice.
function mustReplace(html: string, from: RegExp | string, to: string): string {
  const out = html.replace(from, to);
  if (out === html) throw new Error("buildClientInvitationEmail: base invitation template changed");
  return out;
}

export function buildClientInvitationEmail({ parentName, acceptUrl }: { parentName: string; acceptUrl: string }): string {
  const name = escapeHtml(parentName);
  let html = buildInvitationEmail({ role: "admin", acceptUrl });
  html = mustReplace(
    html,
    /You've been invited to join as <strong>[\s\S]*?<\/strong>\.<br>\s*Accept below to create your account and get started\./,
    `<strong>${name}</strong> has invited you to create your own WBMSG account.<br>Accept below to create your account and get started.`,
  );
  return mustReplace(
    html,
    "This invitation expires in 7 days.<br>",
    `Important: ${name} will have full read access to the new account, including its conversations, contacts and settings.<br>This invitation expires in 7 days.<br>`,
  );
}
