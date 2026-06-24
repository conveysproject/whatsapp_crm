"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";
import { getSocket } from "@/lib/socket";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess, canAccessSub } from "@/lib/can";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  displayStatus: string;
  isArchived: boolean;
  deleteAllowed: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
}

type Tab = "all" | "draft" | "upcoming" | "running" | "paused" | "completed" | "aborted" | "archived";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "upcoming", label: "Upcoming" },
  { key: "running", label: "Running" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
  { key: "aborted", label: "Aborted" },
  { key: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray",
  upcoming: "yellow",
  scheduled: "yellow",
  running: "blue",
  paused: "yellow",
  completed: "green",
  cancelled: "red",
  aborted: "red",
};

export default function CampaignsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>("all");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "campaigns_access"); // parent: lifecycle actions (no sub for abort/pause/delete)
  const canCreate = canAccessSub(user, "campaigns_access", "campaigns_create"); // sub: create new campaigns

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Campaign[] }).data;
    },
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.status === "running" || c.status === "scheduled") ? 8000 : false,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    function refresh() {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    }

    socket.on("campaign:completed", refresh);
    socket.on("campaign:aborted", refresh);
    socket.on("campaign:expired", refresh);
    return () => {
      socket.off("campaign:completed", refresh);
      socket.off("campaign:aborted", refresh);
      socket.off("campaign:expired", refresh);
    };
  }, [queryClient]);

  const filtered = campaigns.filter((c) => {
    if (tab === "archived") return c.isArchived;
    if (tab === "all") return !c.isArchived;
    return c.displayStatus === tab && !c.isArchived;
  });

  async function doAction(id: string, action: string) {
    const token = await getToken();
    await fetch(`${API_URL}/v1/campaigns/${id}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const token = await getToken();
    await fetch(`${API_URL}/v1/campaigns/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  }

  return (
    <PermissionGate permission="campaigns_access">
    <WhatsAppGate feature="Campaigns">
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Campaigns</h1>
              <p className="text-sm text-gray-500 mt-0.5">{campaigns.filter(c => !c.isArchived).length} active</p>
            </div>
            {canCreate && (
              <Link href="/campaigns/new"><Button>New Campaign</Button></Link>
            )}
          </div>

          {/* Status tabs */}
          <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                  tab === t.key
                    ? "text-brand-600 border-b-2 border-brand-600 -mb-px"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t.label}
                {t.key !== "all" && t.key !== "archived" && (
                  <span className={`ml-1.5 text-xs tabular-nums ${tab === t.key ? "text-brand-500" : "text-gray-400"}`}>
                    {campaigns.filter(c => !c.isArchived && c.displayStatus === t.key).length || ""}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Campaign list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                  <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No {tab === "all" ? "" : tab} campaigns</p>
                {tab === "all" && canCreate && (
                  <Link href="/campaigns/new" className="mt-2 inline-block text-sm text-brand-600 hover:text-brand-700 font-medium">
                    Create your first campaign →
                  </Link>
                )}
              </div>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-4 gap-3 group">
                  <div className="min-w-0">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate block"
                    >
                      {c.name}
                    </Link>
                    {c.scheduledAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_BADGE[c.displayStatus] ?? "gray"}>{c.displayStatus}</Badge>

                    {canManage && c.status === "running" && (
                      <button
                        onClick={() => { void doAction(c.id, "abort"); }}
                        className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Abort
                      </button>
                    )}
                    {canManage && c.status === "running" && (
                      <button
                        onClick={() => { void doAction(c.id, "pause"); }}
                        className="text-xs text-gray-600 hover:text-gray-700 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        Pause
                      </button>
                    )}
                    {canManage && c.status === "paused" && (
                      <button
                        onClick={() => { void doAction(c.id, "resume"); }}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 rounded-md hover:bg-brand-50 transition-colors"
                      >
                        Resume
                      </button>
                    )}
                    {canManage && (c.status === "completed" || c.status === "aborted") && !c.isArchived && (
                      <button
                        onClick={() => { void doAction(c.id, "archive"); }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        Archive
                      </button>
                    )}
                    {canManage && c.isArchived && (
                      <button
                        onClick={() => { void doAction(c.id, "unarchive"); }}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 rounded-md hover:bg-brand-50 transition-colors"
                      >
                        Unarchive
                      </button>
                    )}
                    {canManage && c.deleteAllowed && (
                      <button
                        onClick={() => { void handleDelete(c.id, c.name); }}
                        className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                        title="Delete campaign"
                      >
                        Delete
                      </button>
                    )}
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-xs text-gray-400 hover:text-gray-600 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </WhatsAppGate>
    </PermissionGate>
  );
}
