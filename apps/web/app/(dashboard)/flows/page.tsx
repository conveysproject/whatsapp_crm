import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AutoRepliesSection } from "./auto-replies-section";
import { FlowListActions } from "./flow-list-actions";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface UserData {
  role: string;
  permissions?: Record<string, string>;
}

async function getUserData(token: string): Promise<UserData> {
  try {
    const res = await fetch(`${API_URL}/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return { role: "agent" };
    const json = await res.json() as { data?: { role?: string; permissions?: Record<string, string> } };
    return { role: json.data?.role ?? "agent", permissions: json.data?.permissions };
  } catch { return { role: "agent" }; }
}

interface Flow {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  createdAt: string;
  _count?: { runs: number };
}

async function getFlows(token: string): Promise<Flow[]> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    return res.ok ? (await res.json() as { data: Flow[] }).data : [];
  } catch {
    return [];
  }
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation:      "New Conversation",
  inbound_message:       "Incoming Message",
  keyword_match:         "Keyword Match",
  button_reply:          "Button Reply",
  contact_created:       "Contact Created",
  tag_added:             "Label Added",
  lifecycle_change:      "Stage Changed",
  conversation_resolved: "Conversation Resolved",
  conversation_assigned: "Conversation Assigned",
  no_reply:              "No Reply",
};

export default async function FlowsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const [flows, { role, permissions }] = await Promise.all([getFlows(token), getUserData(token)]);
  const canManage =
    role === "admin" || role === "superAdmin" || role === "manager" ||
    (permissions?.["automation_access"] === "allow" &&
     permissions?.["automation_access@automation_bot_flows"] === "allow");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Automation Flows</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {flows.length} flow{flows.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <Link href="/flows/new">
            <Button>+ New Flow</Button>
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
        {flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl">🔁</span>
            <p className="text-gray-500 text-sm">No flows yet. Create your first automation.</p>
            {canManage && (
              <Link href="/flows/new">
                <Button size="sm">+ New Flow</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {flows.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-0">
                    <Link
                      href={`/flows/${f.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate block"
                    >
                      {f.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {TRIGGER_LABELS[f.triggerType] ?? f.triggerType.replace(/_/g, " ")}
                      </span>
                      {(f._count?.runs ?? 0) > 0 && (
                        <span className="text-xs text-gray-400">· {f._count!.runs} runs</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={f.isActive ? "green" : "gray"}>
                    {f.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {canManage && <FlowListActions flowId={f.id} flowName={f.name} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AutoRepliesSection />
    </div>
  );
}
