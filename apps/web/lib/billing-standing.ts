/** The payment standing of the signed-in organization, for the warning banner (GET /v1/billing/standing). */
export type StandingState = "ok" | "overdue" | "blocked";

export interface Standing {
  state: StandingState;
  /** True only when sending is actually refused (past the grace period and enforcement is on). */
  paused: boolean;
  dueAt: string | null;
  blockAt: string | null;
}

export const OK: Standing = { state: "ok", paused: false, dueAt: null, blockAt: null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
}

/** Never throws; anything unexpected reads as "fine" so a banner cannot appear by accident. */
export function normalizeStanding(raw: unknown): Standing {
  if (!isRecord(raw)) return OK;
  const state = raw["state"] === "overdue" || raw["state"] === "blocked" ? raw["state"] : "ok";
  if (state === "ok") return OK;
  return { state, paused: raw["paused"] === true, dueAt: dateOrNull(raw["dueAt"]), blockAt: dateOrNull(raw["blockAt"]) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function standingDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export interface Banner {
  tone: "warning" | "danger";
  message: string;
}

/** What to tell the user, or null when there is nothing to say. `canPay` is whether the viewer can open the billing page. */
export function bannerFor(s: Standing, canPay: boolean): Banner | null {
  if (s.state === "ok") return null;
  const who = canPay ? "Pay it in Settings > Billing" : "Ask a billing admin to pay it";
  if (s.paused) {
    return { tone: "danger", message: `Sending WhatsApp messages is paused because a WBMSG statement is overdue. ${who} and sending resumes right away.` };
  }
  const by = standingDate(s.blockAt);
  return {
    tone: "warning",
    message: `A WBMSG statement is overdue.${by ? ` ${who} by ${by}, or sending WhatsApp messages will be paused.` : ` ${who} soon to avoid a pause in sending.`}`,
  };
}
