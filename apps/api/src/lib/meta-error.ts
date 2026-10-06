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
  let line = e.code !== null ? `${e.code}${text ? ": " : ""}${text}` : text;
  if (e.details) line += line ? ` (${e.details})` : e.details;
  return line || "Unknown error";
}

/** Strip anything that looks like a phone number (10+ digits) so it can never reach logs. */
export function redactForLog(text: string): string {
  return text.replace(/\+?\d(?:[\s-]*\d){9,}/g, "[redacted]");
}
