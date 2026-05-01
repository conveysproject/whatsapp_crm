import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { MetricCard } from "@/components/analytics/MetricCard";
import { ConversationChart } from "@/components/analytics/ConversationChart";
import { TeamTable } from "@/components/analytics/TeamTable";

interface Overview { openConversations: number; totalContacts: number; messagesToday: number; pendingInvitations: number; }

async function getOverview(token: string): Promise<Overview | null> {
  try {
    const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: Overview }).data : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const overview = await getOverview(await getToken() ?? "");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Open Conversations" value={overview?.openConversations ?? "—"} />
        <MetricCard label="Contacts" value={overview?.totalContacts ?? "—"} />
        <MetricCard label="Messages Today" value={overview?.messagesToday ?? "—"} />
        <MetricCard label="Pending Invitations" value={overview?.pendingInvitations ?? "—"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversationChart />
        <TeamTable />
      </div>
    </div>
  );
}
