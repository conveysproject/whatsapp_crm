import { canAccessSub, type CurrentUser } from "./can";

export interface UsageRow { key: string; label: string; used: number; limit: number | null }
export interface BillingUsage { plan: string; rows: UsageRow[] }

const GATE_LABELS: Record<string, string> = {
  contacts: "Contacts",
  campaigns: "Campaigns",
  chatbots: "Chatbots",
  flows: "Flows",
  custom_fields: "Custom fields",
  team_members: "Team members",
};

export function normalizeUsage(raw: unknown): BillingUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { plan?: unknown; gates?: unknown };
  const plan = typeof r.plan === "string" ? r.plan : "starter";
  const rows: UsageRow[] = [];
  if (r.gates && typeof r.gates === "object") {
    for (const [key, label] of Object.entries(GATE_LABELS)) {
      const g = (r.gates as Record<string, unknown>)[key];
      if (g && typeof g === "object") {
        const { current, limit } = g as { current?: unknown; limit?: unknown };
        if (typeof current === "number" && (typeof limit === "number" || limit === null)) {
          rows.push({ key, label, used: current, limit });
        }
      }
    }
  }
  return { plan, rows };
}

export function canViewBilling(user: CurrentUser | null): boolean {
  return canAccessSub(user, "settings_access", "settings_billing");
}
