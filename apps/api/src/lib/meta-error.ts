export interface MetaDeliveryError {
  code: number | null;
  subcode: number | null;
  title: string | null;
  message: string | null;
  details: string | null;
  href: string | null;
}

const MAX_LEN = 500;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_LEN) : null;
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) ? v : null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function own(o: Record<string, unknown>, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

/** Accepts a webhook `errors[]` entry, a Graph `{ error: {...} }` body, or its inner object. Never throws. */
export function normalizeMetaError(raw: unknown): MetaDeliveryError | null {
  try {
    if (!isObj(raw)) return null;
    const inner = isObj(own(raw, "error")) ? (own(raw, "error") as Record<string, unknown>) : raw;
    const data = own(inner, "error_data");
    const out: MetaDeliveryError = {
      code: int(own(inner, "code")),
      subcode: int(own(inner, "error_subcode")),
      title: str(own(inner, "title")),
      message: str(own(inner, "message")),
      details: isObj(data) ? str(own(data, "details")) : null,
      href: str(own(inner, "href")),
    };
    return Object.values(out).every((v) => v === null) ? null : out;
  } catch {
    return null;
  }
}

export function formatMetaError(e: MetaDeliveryError | null): string {
  if (!e) return "Unknown error";
  const text = [e.title, e.message].filter(Boolean).join(" — ");
  const codeOnly = e.code !== null && !text && !e.details;
  if (codeOnly) return `Meta error ${e.code}`;
  let line = e.code !== null ? `${e.code}${text ? ": " : ""}${text}` : text;
  if (e.details) line += line ? ` (${e.details})` : e.details;
  return line || "Unknown error";
}

/** Strip anything that looks like a phone number (9+ digits, any common separators) so it can never reach logs. */
export function redactForLog(text: string): string {
  return text.replace(/\+?\(?\d(?:[\s\-.()/]*\d){8,}/g, "[redacted]");
}

/** Last 12 chars of a wamid. A full wamid embeds the recipient's phone number in base64, so never log it whole. */
export function shortWamid(id: string | null | undefined): string {
  return (id ?? "").slice(-12);
}

/** Campaign recipient error text for a failed send: Meta's reason when the API returned one, else the error's own message. */
export function describeSendFailure(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "WaApiError") {
      const me = (err as Error & { metaError?: MetaDeliveryError | null }).metaError;
      if (me) return formatMetaError(me);
    }
    return err.message;
  }
  return String(err);
}
