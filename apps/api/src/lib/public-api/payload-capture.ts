const SECRET_KEY = /token|secret|authorization|password|api[_-]?key/i;
const MAX_BODY_CHARS = 16384;
const MAX_STRING = 2000;
const MAX_DEPTH = 8;
const MAX_ITEMS = 200;

export function payloadLoggingEnabled(): boolean {
  return process.env["API_PAYLOAD_LOGGING_ENABLED"] === "true";
}

export function redactValue(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[too deep]";
  if (Array.isArray(v)) return v.slice(0, MAX_ITEMS).map((x) => redactValue(x, depth + 1));
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactValue(val, depth + 1);
    }
    return out;
  }
  if (typeof v === "string") {
    const noQuery = /^https?:\/\/\S*\?/.test(v) ? v.replace(/\?.*$/s, "?[redacted]") : v;
    return noQuery.length > MAX_STRING ? `${noQuery.slice(0, MAX_STRING)}…` : noQuery;
  }
  return v;
}

export function capText(text: string, max = MAX_BODY_CHARS): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

export interface PayloadSnapshot {
  requestBody: string | null;
  responseBody: string | null;
  requestTruncated: boolean;
  responseTruncated: boolean;
  queryString: string | null;
  clientIp: string | null;
  userAgent: string | null;
  errorCode: string | null;
}

function redactQuery(url: string): string | null {
  const i = url.indexOf("?");
  if (i === -1) return null;
  const params = new URLSearchParams(url.slice(i + 1));
  const parts: string[] = [];
  for (const [k, val] of params) parts.push(`${k}=${SECRET_KEY.test(k) ? "[redacted]" : val}`);
  return capText(parts.join("&"), 1000).text || null;
}

export function buildPayloadSnapshot(input: { body: unknown; url: string; responseText: string | undefined; clientIp: string | null; userAgent: string | undefined }): PayloadSnapshot {
  let req: { text: string; truncated: boolean } | null = null;
  if (input.body !== undefined && input.body !== null) {
    try {
      req = capText(JSON.stringify(redactValue(input.body)));
    } catch {
      req = null;
    }
  }
  let errorCode: string | null = null;
  let resText: string | null = null;
  if (input.responseText !== undefined) {
    try {
      const parsed = JSON.parse(input.responseText) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as { error_code?: unknown }).error_code === "string") errorCode = (parsed as { error_code: string }).error_code;
      resText = JSON.stringify(redactValue(parsed));
    } catch {
      resText = input.responseText;
    }
  }
  const res = resText === null ? null : capText(resText);
  return {
    requestBody: req?.text ?? null,
    responseBody: res?.text ?? null,
    requestTruncated: req?.truncated ?? false,
    responseTruncated: res?.truncated ?? false,
    queryString: redactQuery(input.url),
    clientIp: input.clientIp,
    userAgent: input.userAgent ? capText(input.userAgent, 200).text : null,
    errorCode,
  };
}

export function payloadSize(p: PayloadSnapshot): number {
  return (p.requestBody?.length ?? 0) + (p.responseBody?.length ?? 0) + 1024;
}
