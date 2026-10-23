import type { OutboundEmail, SendResult, FetchLike } from "../transport.js";

const TIMEOUT_MS = 10_000;
const USER_AGENT = "wbmsg-mailer/1";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Display name: control chars, angle brackets, quotes and backslashes removed. */
export function cleanName(name: string | null): string | undefined {
  if (!name) return undefined;
  const v = name.replace(CONTROL, " ").replace(/[<>"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return v || undefined;
}

export function cleanSubject(s: string): string {
  return s.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, 998);
}

// eslint-disable-next-line no-control-regex
const ADDRESS_RE = /^[^\s<>",;@\u0000-\u001f\u007f]+@[^\s<>",;@\u0000-\u001f\u007f]+$/;
export function isSafeAddress(a: string): boolean {
  return a.length <= 320 && ADDRESS_RE.test(a);
}

/** `"Name" <addr>` or the bare address; used by providers taking a single From string. The name is a quoted string. */
export function formatFrom(m: OutboundEmail): string {
  const raw = m.from.name?.replace(CONTROL, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!raw) return m.from.address;
  return `"${raw.replace(/[\\"]/g, "\\$&")}" <${m.from.address}>`;
}

export function validateMail(m: OutboundEmail): SendResult | null {
  if (!isSafeAddress(m.to) || !isSafeAddress(m.from.address) || (m.replyTo !== undefined && !isSafeAddress(m.replyTo))) {
    return { ok: false, retryable: false, reason: "invalid email address" };
  }
  return null;
}

const fixed = (retryable: boolean, reason: string): SendResult => ({ ok: false, retryable, reason });

export function classifyStatus(status: number, code?: number): SendResult {
  const suffix = code !== undefined ? `, code ${code}` : "";
  if (status === 401 || status === 403) return fixed(false, `HTTP ${status}: authentication failed${suffix}`);
  if (status >= 300 && status < 400) return fixed(false, "unexpected redirect");
  if (status === 408 || status === 425) return fixed(true, `HTTP ${status}: request timed out${suffix}`);
  if (status === 429) return fixed(true, `HTTP ${status}: rate limited${suffix}`);
  if (status >= 500) return fixed(true, `HTTP ${status}: provider unavailable${suffix}`);
  return fixed(false, `HTTP ${status}: rejected by provider${suffix}`);
}

export interface PostOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
  fetchImpl: FetchLike;
  /** Extra check on a 2xx response; receives the raw text, which must never be echoed. */
  checkBody?: (text: string) => SendResult;
}

export async function post(o: PostOptions): Promise<SendResult> {
  let res: Response;
  try {
    res = await o.fetchImpl(o.url, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, ...o.headers },
      body: o.body,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    // Never use the error message: it may contain the request URL or headers.
    // fetch with redirect "error" rejects a redirect; the server already saw the request, so never retry.
    if ((e as { cause?: { message?: unknown } } | null)?.cause?.message === "unexpected redirect") return fixed(false, "unexpected redirect");
    if (name === "TimeoutError" || name === "AbortError") return fixed(true, "timeout");
    return fixed(true, "network error");
  }
  if (res.status >= 200 && res.status < 300) {
    if (!o.checkBody) return { ok: true };
    let text = "";
    try {
      text = await res.text();
    } catch {
      // The provider answered 2xx: the message may already be accepted, so a retry could send a duplicate.
      return fixed(false, "could not read the provider response");
    }
    return o.checkBody(text);
  }
  try {
    await res.body?.cancel();
  } catch {
    // releasing the connection is best effort
  }
  return classifyStatus(res.status);
}

export const JSON_HEADERS = { "Content-Type": "application/json" } as const;
