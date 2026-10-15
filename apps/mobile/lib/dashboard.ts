import { ApiError } from "./api";

export type Range = "today" | "7d" | "30d";
export interface Kpi { value: number | null; previous: number | null; deltaPct: number | null }
export interface DashboardData {
  range: Range;
  attention: { key: string; severity: "critical" | "warning"; count: number; label: string; href: string }[];
  kpis: {
    openConversations: { value: number };
    newConversations: Kpi;
    newContacts: Kpi;
    firstReplySecs: Kpi;
    campaignsSent: Kpi;
    messages: Kpi & { inbound: number; outbound: number };
  } | null;
  campaignFunnel: { id: string; name: string; sentAt: string; sent: number; delivered: number; read: number; failed: number } | null;
}
export interface Standing { state: "ok" | "overdue" | "blocked" | "cancelled"; paused: boolean; dueAt: string | null; blockAt: string | null }

export function formatCount(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-US");
}

export function formatDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined) return "—";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function deltaText(k: Pick<Kpi, "deltaPct">, lowerIsBetter = false): { text: string; tone: "good" | "bad" | "flat" } | null {
  if (k.deltaPct === null) return null;
  if (k.deltaPct === 0) return { text: "No change", tone: "flat" };
  const up = k.deltaPct > 0;
  const good = lowerIsBetter ? !up : up;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(Math.round(k.deltaPct))}%`, tone: good ? "good" : "bad" };
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "soon";
}

export function standingBanner(s: Standing | undefined): { title: string; body: string; tone: "warning" | "danger" } | null {
  if (!s || s.state === "ok") return null;
  if (s.state === "cancelled") return { title: "This workspace is cancelled", body: "Messages and campaigns can't be sent.", tone: "danger" };
  if (s.state === "blocked" || s.paused) {
    return { title: "Sending is paused", body: "A WBMSG statement is overdue, so messages and campaigns can't be sent. Customers can still message you. An admin can pay on the web dashboard.", tone: "danger" };
  }
  return { title: "Statement overdue", body: `Your WBMSG statement is overdue. Sending will pause on ${day(s.blockAt)} if it isn't paid.`, tone: "warning" };
}

/** Web dashboard links → mobile screens; null when the target only exists on the web. */
export function attentionRoute(href: string): string | null {
  if (href === "/inbox") return "/inbox";
  if (href === "/templates") return "/templates";
  return null;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

export function contactSaveError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "DUPLICATE_PHONE") return "A contact with this phone number already exists.";
    if (err.code === "PLAN_LIMIT_REACHED") return "Your plan's contact limit is reached. An admin can change the plan on the web dashboard.";
    if (err.status === 403) return "You don't have permission to add or edit contacts.";
    if (err.status === 400 && err.message) return err.message;
  }
  return "Couldn't save. Check your connection and try again.";
}
