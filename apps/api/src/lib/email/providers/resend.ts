import type { EmailTransport, FetchLike } from "../transport.js";
import { cleanSubject, formatFrom, JSON_HEADERS, post, validateMail } from "./common.js";

export function resendTransport(apiKey: string, fetchImpl: FetchLike): EmailTransport {
  return {
    async send(m) {
      const bad = validateMail(m);
      if (bad) return bad;
      const body = {
        from: formatFrom(m),
        to: [m.to],
        subject: cleanSubject(m.subject),
        html: m.html,
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      };
      return post({
        url: "https://api.resend.com/emails",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        fetchImpl,
      });
    },
  };
}
