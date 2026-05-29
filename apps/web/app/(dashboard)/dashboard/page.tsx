import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { OrgMetricCards } from "@/components/analytics/OrgMetricCards";
import { ConversationChart } from "@/components/analytics/ConversationChart";
import { CampaignSnapshot } from "@/components/analytics/CampaignSnapshot";
import { TeamLeaderboard } from "@/components/analytics/TeamLeaderboard";
import { ActivityFeed } from "@/components/analytics/ActivityFeed";
import { QuickActions } from "@/components/analytics/QuickActions";
import { MyWorkSection } from "@/components/analytics/MyWorkSection";

interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  pendingInvitations: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

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

interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer";
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getOverview(token: string): Promise<OverviewMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: OverviewMetrics }).data : null;
  } catch { return null; }
}

async function getUsage(token: string): Promise<UsageData | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/billing/usage`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: UsageData }).data : null;
  } catch { return null; }
}

async function getCurrentUser(token: string): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: CurrentUser }).data : null;
  } catch { return null; }
}

async function getWabaConnected(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/onboarding/status`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return false;
    return ((await res.json()) as { wabaConnected: boolean }).wabaConnected;
  } catch { return false; }
}

function greeting(fullName: string): string {
  const hour = new Date().getHours();
  const firstName = fullName.split(" ")[0] ?? fullName;
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

const GATE_LABELS: Record<string, string> = {
  contacts: "Contacts", campaigns: "Campaigns", chatbots: "Bots",
  flows: "Flows", custom_fields: "Custom Fields", team_members: "Team Members",
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

function PlanUsageWidget({ usage }: { usage: UsageData }): JSX.Element {
  const gateKeys = ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const;
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Plan Usage</h2>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full capitalize">{usage.plan}</span>
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
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{GATE_LABELS[key]}</span>
                <span className={`tabular-nums font-medium ${!gate.allowed ? "text-red-600" : "text-gray-500"}`}>
                  {gate.current} / {gate.limit == null ? "Unlimited" : String(gate.limit)}
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
          return (
            <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${on ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
              {key === "ai_chat_bot" ? "AI Bot" : "API Access"}: {on ? "On" : "Off"}
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

  const [overview, usage, currentUser, wabaConnected] = await Promise.all([
    getOverview(token),
    getUsage(token),
    getCurrentUser(token),
    getWabaConnected(token),
  ]);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.role === "superAdmin";
  const greetingText = greeting(currentUser?.fullName ?? "there");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{greetingText}</h1>
        <a
          href="/settings/whatsapp-account"
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
            wabaConnected
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${wabaConnected ? "bg-green-500" : "bg-amber-400"}`} />
          {wabaConnected ? "WhatsApp Connected" : "WhatsApp Disconnected"}
        </a>
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* My Work */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-4">My Work</h2>
        <MyWorkSection />
      </section>

      {/* Org Overview — admin/manager only */}
      {isAdmin && (
        <section className="space-y-6">
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Org Overview</h2>
          </div>

          {overview && (
            <OrgMetricCards
              openConversations={overview.openConversations}
              totalContacts={overview.totalContacts}
              messagesToday={overview.messagesToday}
              campaignsSentThisMonth={overview.campaignsSentThisMonth}
              avgFirstResponseTime={overview.avgFirstResponseTime}
              botConversations={overview.botConversations}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ConversationChart />
            <CampaignSnapshot />
            {usage && <PlanUsageWidget usage={usage} />}
          </div>

          <TeamLeaderboard />

          <ActivityFeed />
        </section>
      )}
    </div>
  );
}
