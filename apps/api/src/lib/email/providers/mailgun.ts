import type { EmailTransport, FetchLike } from "../transport.js";
import { cleanSubject, formatFrom, post, validateMail } from "./common.js";

const HOSTS = { us: "https://api.mailgun.net", eu: "https://api.eu.mailgun.net" } as const;

// `domain` must already be validated as a hostname by buildHttpTransport.
export function mailgunTransport(apiKey: string, domain: string, region: "us" | "eu", fetchImpl: FetchLike): EmailTransport {
  return {
    async send(m) {
      const bad = validateMail(m);
      if (bad) return bad;
      const form = new URLSearchParams();
      form.set("from", formatFrom(m));
      form.set("to", m.to);
      form.set("subject", cleanSubject(m.subject));
      form.set("html", m.html);
      if (m.replyTo) form.set("h:Reply-To", m.replyTo);
      return post({
        url: `${HOSTS[region]}/v3/${encodeURIComponent(domain)}/messages`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        },
        body: form.toString(),
        fetchImpl,
      });
    },
  };
}
