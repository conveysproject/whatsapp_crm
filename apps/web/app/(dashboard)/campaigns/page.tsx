"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  isArchived: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray",
  scheduled: "yellow",
  running: "blue",
  paused: "yellow",
  completed: "green",
  cancelled: "red",
  aborted: "red",
};

export default function CampaignsPage(): JSX.Element {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns", tab],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      const json = await res.json() as { data: Campaign[] };
      return json.data.filter((c) => tab === "archived" ? c.isArchived : !c.isArchived);
    },
  });

  async function doAction(id: string, action: string) {
    const token = await getToken();
    await fetch(`${API_URL}/v1/campaigns/${id}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  }

  return (
    <WhatsAppGate feature="Campaigns">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
          <Link href="/campaigns/new"><Button>New Campaign</Button></Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {(["active", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2 text-sm font-medium capitalize transition-colors",
                tab === t ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : campaigns.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No {tab} campaigns.
            </p>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <Link href={`/campaigns/${c.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600 truncate block">
                    {c.name}
                  </Link>
                  {c.scheduledAt && (
                    <p className="text-xs text-gray-500">{new Date(c.scheduledAt).toLocaleString("en-IN")}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusVariant[c.status] ?? "gray"}>{c.status}</Badge>
                  {c.status === "running" && (
                    <button
                      onClick={() => { void doAction(c.id, "abort"); }}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Abort
                    </button>
                  )}
                  {(c.status === "completed" || c.status === "aborted") && !c.isArchived && (
                    <button
                      onClick={() => { void doAction(c.id, "archive"); }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Archive
                    </button>
                  )}
                  {c.isArchived && (
                    <button
                      onClick={() => { void doAction(c.id, "unarchive"); }}
                      className="text-xs text-brand-600 hover:text-brand-700"
                    >
                      Unarchive
                    </button>
                  )}
                  {c.status !== "running" && !c.isArchived && (
                    <button
                      onClick={() => { void doAction(c.id, "requeue-failed"); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                      title="Requeue failed recipients"
                    >
                      Requeue
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </WhatsAppGate>
  );
}
