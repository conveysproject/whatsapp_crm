/**
 * Instant after which every outbound template message is linked to its template at send time.
 * Legacy unlinked messages all predate the deploy of the template_id migration. This constant must be LATER than the
 * actual deploy date: later is only slower (a wider note query), earlier would hide the attribution note for messages
 * sent between the constant and the deploy. Override with env TEMPLATE_LINK_RELEASED_AT (ISO date) on Railway.
 */
export const DEFAULT_TEMPLATE_LINK_RELEASED_AT = new Date("2026-10-20T00:00:00Z");

export function parseReleasedAt(raw: string | undefined): Date {
  if (!raw) return DEFAULT_TEMPLATE_LINK_RELEASED_AT;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? DEFAULT_TEMPLATE_LINK_RELEASED_AT : d;
}

export const TEMPLATE_LINK_RELEASED_AT: Date = parseReleasedAt(process.env.TEMPLATE_LINK_RELEASED_AT);
