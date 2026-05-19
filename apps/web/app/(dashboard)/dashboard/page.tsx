import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { MetricCard } from "@/components/analytics/MetricCard";
import { ConversationChart } from "@/components/analytics/ConversationChart";
import { TeamTable } from "@/components/analytics/TeamTable";

interface Overview { openConversations: number; totalContacts: number; messagesToday: number; pendingInvitations: number; }

interface UsageGate { current: number; limit: number | null; allowed: boolean; }
interface FeatureSwitch { enabled: boolean; }
interface UsageData {
  plan: string;
  unavailableFeatures: string[];
  gates: {
    contacts: UsageGate;
    campaigns: UsageGate;
    chatbots: UsageGate;
    flows: UsageGate;
    custom_fields: UsageGate;
    team_members: UsageGate;
    ai_chat_bot: FeatureSwitch;
    api_access: FeatureSwitch;
  };
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getOverview(token: string): Promise<Overview | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: Overview }).data : null;
  } catch {
    return null;
  }
}

async function getUsage(token: string): Promise<UsageData | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/billing/usage`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: UsageData }).data : null;
  } catch {
    return null;
  }
}

const GATE_LABELS: Record<string, string> = {
  contacts: "Contacts",
  campaigns: "Campaigns",
  chatbots: "Bots",
  flows: "Flows",
  custom_fields: "Custom Fields",
  team_members: "Team Members",
};

function UsageBar({ current, limit, allowed }: UsageGate): JSX.Element {
  const pct = limit != null && limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const barColor = !allowed ? "bg-red-500" : pct >= 80 ? "bg-yellow-400" : "bg-blue-500";
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${limit == null ? 0 : pct}%` }} />
    </div>
  );
}

// GAP-S46: plan usage widget — shows current vs limit for all 6 entity types
function PlanUsageWidget({ usage }: { usage: UsageData }): JSX.Element {
  const gateKeys = ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const;
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Plan Usage</h2>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full capitalize">
          {usage.plan}
        </span>
      </div>

      {usage.unavailableFeatures.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Limit reached: {usage.unavailableFeatures.map((f) => GATE_LABELS[f] ?? f).join(", ")}.{" "}
          <a href="/settings/billing" className="underline font-medium">Upgrade plan</a>
        </div>
      )}

      <div className="space-y-3">
        {gateKeys.map((key) => {
          const gate = usage.gates[key];
          const limitLabel = gate.limit == null ? "Unlimited" : String(gate.limit);
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{GATE_LABELS[key]}</span>
                <span className={`tabular-nums font-medium ${!gate.allowed ? "text-red-600" : "text-gray-500"}`}>
                  {gate.current} / {limitLabel}
                </span>
              </div>
              <UsageBar {...gate} />
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pt-1">
        {(["ai_chat_bot", "api_access"] as const).map((key) => {
          const on = usage.gates[key].enabled;
          const label = key === "ai_chat_bot" ? "AI Bot" : "API Access";
          return (
            <span
              key={key}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${on ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}
            >
              {label}: {on ? "On" : "Off"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const [overview, usage] = await Promise.all([getOverview(token), getUsage(token)]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Open Conversations" value={overview?.openConversations ?? "—"} />
        <MetricCard label="Contacts" value={overview?.totalContacts ?? "—"} />
        <MetricCard label="Messages Today" value={overview?.messagesToday ?? "—"} />
        <MetricCard label="Pending Invitations" value={overview?.pendingInvitations ?? "—"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ConversationChart />
        <TeamTable />
        {usage && <PlanUsageWidget usage={usage} />}
      </div>
    </div>
  );
}
