/**
 * Data layer for GET /v1/billing/usage (see apps/api/src/routes/billing.ts).
 * Normalisation never throws: a partial or malformed body degrades to safe defaults.
 */

export const GATE_KEYS = ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const;
export type GateKey = (typeof GATE_KEYS)[number];

export const GATE_LABELS: Record<GateKey, string> = {
  contacts: "Contacts",
  campaigns: "Campaigns",
  chatbots: "Bots",
  flows: "Flows",
  custom_fields: "Custom Fields",
  team_members: "Team Members",
};

export interface UsageGate { current: number; limit: number | null; allowed: boolean }
export interface UsageSummary { plan: string; gates: Record<GateKey, UsageGate> }
export type GateLevel = "ok" | "warn" | "blocked";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function gate(v: unknown): UsageGate {
  const o = isRecord(v) ? v : {};
  const current = typeof o["current"] === "number" && Number.isFinite(o["current"]) ? o["current"] : 0;
  const limit = typeof o["limit"] === "number" && Number.isFinite(o["limit"]) ? o["limit"] : null;
  return { current, limit, allowed: o["allowed"] !== false };
}

export function normalizeUsage(raw: unknown): UsageSummary | null {
  if (!isRecord(raw)) return null;
  const gates = isRecord(raw["gates"]) ? raw["gates"] : {};
  const out = {} as Record<GateKey, UsageGate>;
  for (const k of GATE_KEYS) out[k] = gate(gates[k]);
  return { plan: typeof raw["plan"] === "string" ? raw["plan"] : "", gates: out };
}

/** Same thresholds as the legacy PlanUsageWidget: red when blocked, amber at >= 80%. */
export function gateLevel(g: UsageGate): GateLevel {
  if (!g.allowed) return "blocked";
  if (g.limit != null && g.limit > 0 && (g.current / g.limit) * 100 >= 80) return "warn";
  return "ok";
}

export async function fetchUsage(getToken: () => Promise<string | null>, signal?: AbortSignal): Promise<UsageSummary | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/v1/billing/usage`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
      signal,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return normalizeUsage(isRecord(json) ? json["data"] : undefined);
  } catch {
    return null;
  }
}
