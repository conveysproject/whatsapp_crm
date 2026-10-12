/** The organization's own cancellation state (GET /v1/billing/cancellation). */
export interface CancellationState {
  status: "requested" | "approved" | "withdrawn";
  requestedAt: string | null;
  approvedAt: string | null;
  deleteAfter: string | null;
}

function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
}

/** Never throws. Anything unexpected reads as "no cancellation", so the cancel button is what shows. */
export function normalizeCancellation(raw: unknown): CancellationState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r["status"] !== "requested" && r["status"] !== "approved" && r["status"] !== "withdrawn") return null;
  return { status: r["status"], requestedAt: dateOrNull(r["requestedAt"]), approvedAt: dateOrNull(r["approvedAt"]), deleteAfter: dateOrNull(r["deleteAfter"]) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** What to tell the customer about their request. */
export function cancellationText(s: CancellationState): string | null {
  if (s.status === "requested") {
    const on = shortDate(s.requestedAt);
    return `Cancellation requested${on ? ` on ${on}` : ""}. We will confirm shortly. Until we do, nothing changes.`;
  }
  if (s.status === "approved") {
    const on = shortDate(s.approvedAt);
    const until = shortDate(s.deleteAfter);
    return `Your account was cancelled${on ? ` on ${on}` : ""}. Sending is off.${until ? ` You can still sign in and export your data until ${until}.` : ""} If this is a mistake, write to info@conveys.in.`;
  }
  return null;
}
