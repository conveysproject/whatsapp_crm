import type { EmailTransport, FetchLike } from "../transport.js";
import { cleanName, cleanSubject, JSON_HEADERS, post, validateMail } from "./common.js";

const HOSTS = { us: "https://api.sparkpost.com", eu: "https://api.eu.sparkpost.com" } as const;

export function sparkpostTransport(apiKey: string, region: "us" | "eu", fetchImpl: FetchLike): EmailTransport {
  return {
    async send(m) {
      const bad = validateMail(m);
      if (bad) return bad;
      const name = cleanName(m.from.name);
      const body = {
        content: {
          from: { email: m.from.address, ...(name ? { name } : {}) },
          subject: cleanSubject(m.subject),
          html: m.html,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        },
        recipients: [{ address: { email: m.to } }],
      };
      return post({
        url: `${HOSTS[region]}/api/v1/transmissions`,
        // SparkPost takes the bare key in Authorization (no Bearer prefix).
        headers: { ...JSON_HEADERS, Authorization: apiKey },
        body: JSON.stringify(body),
        fetchImpl,
      });
    },
  };
}
