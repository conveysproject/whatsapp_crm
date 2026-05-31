"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { OrgMetricCards } from "./OrgMetricCards";
import { ConversationChart } from "./ConversationChart";
import { CampaignSnapshot } from "./CampaignSnapshot";
import { ActivityFeed } from "./ActivityFeed";

interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OverviewTabProps {
  days: number;
}

export function OverviewTab({ days }: OverviewTabProps): JSX.Element {
  const { getToken } = useAuth();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/overview?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          setMetrics((await res.json() as { data: OverviewMetrics }).data);
        } else {
          setError("Failed to load overview metrics.");
        }
      } catch {
        setError("Network error loading overview.");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    void load();
  }, [getToken, days]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
      {metrics && (
        <OrgMetricCards
          openConversations={metrics.openConversations}
          totalContacts={metrics.totalContacts}
          messagesToday={metrics.messagesToday}
          campaignsSentThisMonth={metrics.campaignsSentThisMonth}
          avgFirstResponseTime={metrics.avgFirstResponseTime}
          botConversations={metrics.botConversations}
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversationChart days={days} />
        <CampaignSnapshot />
      </div>
      <ActivityFeed />
    </div>
  );
}
