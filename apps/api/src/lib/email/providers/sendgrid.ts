import type { EmailTransport, FetchLike } from "../transport.js";
import { cleanName, cleanSubject, JSON_HEADERS, post, validateMail } from "./common.js";

const HOSTS = { us: "https://api.sendgrid.com", eu: "https://api.eu.sendgrid.com" } as const;

export function sendgridTransport(apiKey: string, region: "us" | "eu", fetchImpl: FetchLike): EmailTransport {
  return {
    async send(m) {
      const bad = validateMail(m);
      if (bad) return bad;
      const name = cleanName(m.from.name);
      const body = {
        personalizations: [{ to: [{ email: m.to }] }],
        from: { email: m.from.address, ...(name ? { name } : {}) },
        ...(m.replyTo ? { reply_to: { email: m.replyTo } } : {}),
        subject: cleanSubject(m.subject),
        content: [{ type: "text/html", value: m.html }],
      };
      return post({
        url: `${HOSTS[region]}/v3/mail/send`,
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        fetchImpl,
      });
    },
  };
}
