"use client";

import { JSX, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

type LogTab = "queue" | "executed" | "expired";

interface Recipient {
  id: string;
  status: string;
  phoneNumber: string;
  sentAt?: string | null;
  errorMessage?: string | null;
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string } | null;
}

const STATUS_BADGE: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  pending: "yellow",
  sent: "blue",
  delivered: "green",
  read: "green",
  failed: "red",
  expired: "gray",
};

const TAB_LABELS: Record<LogTab, string> = { queue: "Queue", executed: "Executed", expired: "Expired" };

const EXPORT_PATHS: Record<LogTab, string> = {
  queue: "queue-log-export",
  executed: "export",
  expired: "expired-log-export",
};

const TAB_ROUTE: Record<LogTab, string> = {
  queue: "queue-log",
  executed: "recipients",
  expired: "expired-log",
};

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function SkeletonRows(): JSX.Element {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
        </div>
      ))}
    </>
  );
}

export default function CampaignLogsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [tab, setTab] = useState<LogTab>("queue");
  const [pages, setPages] = useState<Record<LogTab, number>>({ queue: 1, executed: 1, expired: 1 });
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}/${EXPORT_PATHS[tab]}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${id}-${tab}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const page = pages[tab];

  const { data, isLoading, isFetching } = useQuery<{ data: Recipient[]; total?: number }>({
    queryKey: ["campaign-log", id, tab, page],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}/${TAB_ROUTE[tab]}?page=${page}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.json() as Promise<{ data: Recipient[]; total?: number }>;
    },
  });

  const recipients = data?.data ?? [];
  const total = data?.total ?? recipients.length;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const loading = isLoading || isFetching;

  function setPage(n: number) {
    setPages((prev) => ({ ...prev, [tab]: n }));
  }

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

        {/* Breadcrumb */}
        <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Campaign
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Campaign Logs</h1>
          <button
            onClick={() => { void handleDownload(); }}
            disabled={downloading}
            className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {downloading ? "Downloading…" : `Download ${TAB_LABELS[tab]} CSV`}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-gray-200">
          {(Object.keys(TAB_LABELS) as LogTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t ? "text-brand-600 border-b-2 border-brand-600 -mb-px" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <SkeletonRows />
          ) : recipients.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </div>
              <p className="text-gray-500 font-medium">No records in {TAB_LABELS[tab].toLowerCase()} log</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recipients.map((r) => {
                const displayName = r.contact
                  ? [r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || r.phoneNumber
                  : r.phoneNumber;
                const initials = displayName.slice(0, 2).toUpperCase();
                return (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">+{r.contact?.phoneNumber ?? r.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {r.sentAt && (
                        <span className="text-xs text-gray-400 hidden sm:block">
                          {new Date(r.sentAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                      <Badge variant={STATUS_BADGE[r.status] ?? "gray"}>{r.status}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
