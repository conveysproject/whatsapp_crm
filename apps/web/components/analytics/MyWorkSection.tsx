"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface ConversationPreview {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface MyWorkData {
  assignedOpen: number;
  unreadCount: number;
  assignedContacts: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: ConversationPreview[];
}

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function MyWorkSection(): JSX.Element {
  const [data, setData] = useState<MyWorkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/my-work`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: MyWorkData }).data);
        else setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-gray-400">Could not load data</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-4">
        <Link href="/inbox?filter=assigned" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors">
          <p className="text-xs text-gray-500">My Open Convos</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.assignedOpen}</p>
        </Link>
        <Link href="/inbox?filter=unread" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors">
          <p className="text-xs text-gray-500">Unread Messages</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.unreadCount}</p>
        </Link>
        <Link href="/contacts?filter=assigned" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors">
          <p className="text-xs text-gray-500">My Contacts</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.assignedContacts}</p>
        </Link>
      </div>

      {/* Conversation previews */}
      {data.topConversations.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Assigned Conversations</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {data.topConversations.map((conv) => (
              <Link key={conv.id} href={`/inbox?conversation=${conv.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName}</p>
                  <p className="text-xs text-gray-500 truncate">{conv.lastMessagePreview}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className="text-xs text-gray-400">{relativeTime(conv.lastMessageAt)}</span>
                  {conv.unreadCount > 0 && (
                    <span className="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">No open conversations assigned to you</p>
          <Link href="/inbox" className="mt-2 inline-block text-xs text-blue-600 hover:underline">Go to Inbox</Link>
        </div>
      )}

      {/* My performance */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Performance</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500">Resolved Today</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{data.resolvedToday}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500">Avg First Response</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatDuration(data.avgFirstResponseSecs)}</p>
          </div>
          <div className={`bg-white border rounded-xl p-4 shadow-sm ${data.slaBreaches > 0 ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
            <p className="text-xs text-gray-500">SLA Breaches</p>
            <p className={`mt-1 text-2xl font-bold ${data.slaBreaches > 0 ? "text-red-600" : "text-gray-900"}`}>
              {data.slaBreaches}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
