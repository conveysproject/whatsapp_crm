export interface DeliveryError {
  code: number | null;
  title: string | null;
  message: string | null;
  details: string | null;
}

/** Full one-line reason for tooltips: `131049: Title — Message (details)`. Empty string when there is no error. */
export function formatDeliveryError(e: DeliveryError | null | undefined): string {
  if (!e) return "";
  const text = [e.title, e.message].filter(Boolean).join(" — ");
  let line = e.code != null ? `${e.code}${text ? ": " : ""}${text}` : text;
  if (e.details) line += line ? ` (${e.details})` : e.details;
  return line;
}

/** Short visible label: `Title (code 131049)`, `Message (code N)` or `Code N`. Empty string when there is no error. */
export function shortDeliveryError(e: DeliveryError | null | undefined): string {
  if (!e) return "";
  const label = e.title ?? e.message;
  if (label && e.code != null) return `${label} (code ${e.code})`;
  if (label) return label;
  if (e.code != null) return `Code ${e.code}`;
  return "";
}
