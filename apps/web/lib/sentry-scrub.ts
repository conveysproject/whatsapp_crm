// Keeps credentials out of Sentry. The internal email relay receives customer SMTP passwords in its
// request body, so nothing from /api/internal/* requests may leave the process, and the sensitive
// keys are redacted anywhere else they might appear (extra, contexts, breadcrumbs).

const SENSITIVE_KEYS = new Set(["smtp", "pass", "password", "apikey", "authorization", "secret"]);
const MAX_DEPTH = 10;

function redactDeep(value: unknown, depth: number, seen: WeakSet<object>): void {
  if (typeof value !== "object" || value === null || depth > MAX_DEPTH || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const v of value) redactDeep(v, depth + 1, seen);
    return;
  }
  const o = value as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) o[k] = "[Filtered]";
    else redactDeep(o[k], depth + 1, seen);
  }
}

interface ScrubbableEvent {
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: Record<string, unknown>; [k: string]: unknown };
  [k: string]: unknown;
}

/** Sentry beforeSend: returns the same event, scrubbed in place. */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const req = event.request;
  if (req) {
    if (typeof req.url === "string" && /\/api\/internal(\/|\?|$)/.test(req.url)) {
      delete req.data;
      delete req.cookies;
      delete req["query_string"];
      if (req.headers) {
        for (const h of Object.keys(req.headers)) if (h.toLowerCase() === "authorization") delete req.headers[h];
      }
    }
  }
  redactDeep(event, 0, new WeakSet());
  return event;
}
