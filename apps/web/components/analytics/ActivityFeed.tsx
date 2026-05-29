"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface ActivityEvent {
  type: "contact_created" | "campaign_sent" | "conversation_closed" | "member_joined";
  label: string;
  timestamp: string;
}

const ICONS: Record<ActivityEvent["type"], string> = {
  contact_created: "👤",
  campaign_sent: "📢",
  conversation_closed: "✅",
  member_joined: "🎉",
};

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

export function ActivityFeed(): JSX.Element | null {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/activity-feed`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setEvents((await res.json() as { data: ActivityEvent[] }).data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

  if (loading) return <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />;
  if (events.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {events.map((event, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-3">
            <span className="text-base shrink-0">{ICONS[event.type]}</span>
            <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{event.label}</p>
            <span className="text-xs text-gray-400 shrink-0">{relativeTime(event.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
