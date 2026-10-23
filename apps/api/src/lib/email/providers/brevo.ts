import type { EmailTransport, FetchLike } from "../transport.js";
import { cleanName, cleanSubject, JSON_HEADERS, post, validateMail } from "./common.js";

export function brevoTransport(apiKey: string, fetchImpl: FetchLike): EmailTransport {
  return {
    async send(m) {
      const bad = validateMail(m);
      if (bad) return bad;
      const name = cleanName(m.from.name);
      const body = {
        sender: { ...(name ? { name } : {}), email: m.from.address },
        to: [{ email: m.to }],
        subject: cleanSubject(m.subject),
        htmlContent: m.html,
        ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}),
      };
      return post({
        url: "https://api.brevo.com/v3/smtp/email",
        headers: { ...JSON_HEADERS, Accept: "application/json", "api-key": apiKey },
        body: JSON.stringify(body),
        fetchImpl,
      });
    },
  };
}
