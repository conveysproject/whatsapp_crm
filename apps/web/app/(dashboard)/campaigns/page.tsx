import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
}

async function getCampaigns(token: string): Promise<Campaign[]> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/campaigns`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    return (await res.json() as { data: Campaign[] }).data;
  } catch { return []; }
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray",
  scheduled: "yellow",
  running: "blue",
  completed: "green",
  cancelled: "red",
};

export default async function CampaignsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const campaigns = await getCampaigns(await getToken() ?? "");

  return (
    <WhatsAppGate feature="Campaigns">
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        <Link href="/campaigns/new">
          <Button>New Campaign</Button>
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {campaigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No campaigns yet.</p>
        ) : (
          campaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                {c.scheduledAt && (
                  <p className="text-xs text-gray-500">
                    {new Date(c.scheduledAt).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
              <Badge variant={statusVariant[c.status] ?? "gray"}>{c.status}</Badge>
            </div>
          ))
        )}
      </div>
      </div>
    </WhatsAppGate>
  );
}
