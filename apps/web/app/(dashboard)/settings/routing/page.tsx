import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  assignTo: string;
  assignType: string;
  isActive: boolean;
}

async function getRules(token: string): Promise<RoutingRule[]> {
  const res = await fetch(
    `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/routing-rules`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) return [];
  return (await res.json() as { data: RoutingRule[] }).data;
}

export default async function RoutingSettingsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const rules = await getRules(await getToken() ?? "");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Routing Rules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-assign incoming conversations based on conditions.
          </p>
        </div>
        <Button>Add Rule</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {rules.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            No routing rules. All conversations are unassigned.
          </p>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                <p className="text-xs text-gray-500">
                  Priority {rule.priority} · assign to {rule.assignType} {rule.assignTo}
                </p>
              </div>
              <Badge variant={rule.isActive ? "green" : "gray"}>
                {rule.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
