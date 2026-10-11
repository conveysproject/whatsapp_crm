/**
 * Meta's own billing signal for a message: the `pricing` object on the WhatsApp status webhook
 * (sent / delivered / read). Documented values of `type`: regular (Meta charges), free_customer_service,
 * free_entry_point. WBMSG counts a message for billing only when Meta charges for it (type regular).
 * Anything unexpected is stored as-is (lower-cased) and is NOT counted: we never bill on a guess.
 */
export interface MetaPricing {
  type: string;
  category: string | null;
}

const TOKEN = /^[a-z_]{1,40}$/;

function token(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return TOKEN.test(t) ? t : null;
}

export function extractMetaPricing(raw: unknown): MetaPricing | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  let type = token(o["type"]);
  // Meta plans to deprecate `billable`; use it only when `type` is absent.
  if (!type && typeof o["billable"] === "boolean") type = o["billable"] ? "regular" : "free";
  if (!type) return null;
  return { type, category: token(o["category"]) };
}

export function isMetaBillable(type: string | null | undefined): boolean {
  return type === "regular";
}
