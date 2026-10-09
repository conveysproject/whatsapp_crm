/**
 * Data layer for GET /v1/analytics/dashboard (see apps/api/src/routes/analytics.ts).
 * The normalizer never throws: a partial or malformed body degrades to zeros/empties.
 */

export type DashRange = "today" | "7d" | "30d";
export type Severity = "critical" | "warning";

export interface AttentionItem { key: string; severity: Severity; count: number; label: string; href: string }
export interface Kpi { value: number | null; previous: number | null; deltaPct: number | null }
export interface MessagesKpi extends Kpi { inbound: number; outbound: number }
export interface Funnel { id: string; name: string; sentAt: string; sent: number; delivered: number; read: number; failed: number }

export interface DashboardData {
  range: DashRange;
  tz: string;
  generatedAt: string;
  attention: AttentionItem[];
  kpis: {
    openConversations: { value: number };
    newConversations: Kpi;
    newContacts: Kpi;
    messages: MessagesKpi;
    firstReplySecs: Kpi;
    campaignsSent: Kpi;
  };
  campaignFunnel: { current: Funnel; previous: Funnel | null } | null;
}

export class DashboardError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DashboardError";
    this.status = status;
  }
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function kpi(v: unknown, emptyValue: number | null): Kpi {
  const o = isRecord(v) ? v : {};
  return {
    value: emptyValue === null ? numOrNull(o["value"]) : num(o["value"], emptyValue),
    previous: emptyValue === null ? numOrNull(o["previous"]) : num(o["previous"], emptyValue),
    deltaPct: numOrNull(o["deltaPct"]),
  };
}

function attentionItem(v: unknown): AttentionItem | null {
  if (!isRecord(v)) return null;
  const { key, severity, count, label, href } = v;
  if (typeof key !== "string" || typeof label !== "string" || typeof href !== "string") return null;
  if (severity !== "critical" && severity !== "warning") return null;
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  return { key, severity, count, label, href };
}

function funnel(v: unknown): Funnel | null {
  if (!isRecord(v)) return null;
  if (typeof v["id"] !== "string") return null;
  return {
    id: v["id"],
    name: str(v["name"]),
    sentAt: str(v["sentAt"]),
    sent: num(v["sent"], 0),
    delivered: num(v["delivered"], 0),
    read: num(v["read"], 0),
    failed: num(v["failed"], 0),
  };
}

export function normalizeDashboard(raw: unknown): DashboardData {
  const o = isRecord(raw) ? raw : {};
  const k = isRecord(o["kpis"]) ? o["kpis"] : {};
  const msgs = isRecord(k["messages"]) ? k["messages"] : {};
  const open = isRecord(k["openConversations"]) ? k["openConversations"] : {};
  const cf = isRecord(o["campaignFunnel"]) ? o["campaignFunnel"] : null;
  const current = cf ? funnel(cf["current"]) : null;
  const range: DashRange = o["range"] === "today" || o["range"] === "30d" ? o["range"] : "7d";
  return {
    range,
    tz: str(o["tz"], "UTC"),
    generatedAt: str(o["generatedAt"]),
    attention: Array.isArray(o["attention"])
      ? (o["attention"] as unknown[]).map(attentionItem).filter((x): x is AttentionItem => x !== null)
      : [],
    kpis: {
      openConversations: { value: num(open["value"], 0) },
      newConversations: kpi(k["newConversations"], 0),
      newContacts: kpi(k["newContacts"], 0),
      messages: { ...kpi(msgs, 0), inbound: num(msgs["inbound"], 0), outbound: num(msgs["outbound"], 0) },
      firstReplySecs: kpi(k["firstReplySecs"], null),
      campaignsSent: kpi(k["campaignsSent"], 0),
    },
    campaignFunnel: current && cf ? { current, previous: funnel(cf["previous"]) } : null,
  };
}

export async function fetchDashboard(
  getToken: () => Promise<string | null>,
  range: DashRange,
  tz: string,
  signal?: AbortSignal,
): Promise<DashboardData> {
  let res: Response;
  try {
    const token = await getToken();
    res = await fetch(`${API_BASE}/v1/analytics/dashboard?range=${range}&tz=${encodeURIComponent(tz)}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new DashboardError("Network error", 0);
  }
  if (!res.ok) throw new DashboardError(`Dashboard request failed (${res.status})`, res.status);
  let json: unknown;
  try { json = await res.json(); } catch { throw new DashboardError("Invalid response", res.status); }
  return normalizeDashboard(isRecord(json) ? json["data"] : undefined);
}
