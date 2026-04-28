import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Flow { id: string; name: string; triggerType: string; isActive: boolean; }

async function getFlows(token: string): Promise<Flow[]> {
  try {
    const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: Flow[] }).data : [];
  } catch { return []; }
}

export default async function FlowsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const flows = await getFlows(await getToken() ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Automation Flows</h1>
        <Link href="/flows/new"><Button>New Flow</Button></Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {flows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No flows yet.</p>
        ) : (
          flows.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link href={`/flows/${f.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">{f.name}</Link>
                <p className="text-xs text-gray-500">{f.triggerType.replace(/_/g, " ")}</p>
              </div>
              <Badge variant={f.isActive ? "green" : "gray"}>{f.isActive ? "Active" : "Inactive"}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
