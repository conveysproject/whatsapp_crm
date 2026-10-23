import type { EmailTransport, FetchLike, SendResult } from "../transport.js";
import { classifyStatus, cleanSubject, formatFrom, JSON_HEADERS, post, validateMail } from "./common.js";

// Postmark can answer 200 with a non-zero ErrorCode; that is a failure.
function checkBody(text: string): SendResult {
  let code: unknown;
  try {
    code = (JSON.parse(text) as { ErrorCode?: unknown } | null)?.ErrorCode;
  } catch {
    return { ok: false, retryable: false, reason: "unexpected provider response" };
  }
  if (code === 0) return { ok: true };
  if (typeof code === "number" && Number.isInteger(code)) {
    // 10 = bad server token; the rest are request or recipient problems.
    if (code === 10) return classifyStatus(401, code);
    return { ok: false, retryable: false, reason: `rejected by provider, code ${code}` };
  }
  return { ok: false, retryable: false, reason: "unexpected provider response" };
}

export function postmarkTransport(apiKey: string, fetchImpl: FetchLike): EmailTransport {
  return {
    async send(m) {
      const bad = validateMail(m);
      if (bad) return bad;
      const body = {
        From: formatFrom(m),
        To: m.to,
        Subject: cleanSubject(m.subject),
        HtmlBody: m.html,
        ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
        MessageStream: "outbound",
      };
      return post({
        url: "https://api.postmarkapp.com/email",
        headers: { ...JSON_HEADERS, Accept: "application/json", "X-Postmark-Server-Token": apiKey },
        body: JSON.stringify(body),
        fetchImpl,
        checkBody,
      });
    },
  };
}
