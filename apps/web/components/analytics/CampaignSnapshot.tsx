"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface LastCampaign {
  id: string;
  name: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface NextScheduled {
  id: string;
  name: string;
  scheduledAt: string;
  recipientCount: number;
}

interface SnapshotData {
  lastCampaign: LastCampaign | null;
  nextScheduled: NextScheduled | null;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function DeliveryBar({ delivered, read, totalSent }: { delivered: number; read: number; totalSent: number }): JSX.Element {
  const deliveredPct = totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0;
  const readPct = totalSent > 0 ? Math.round((read / totalSent) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Delivered {deliveredPct}%</span>
        <span>Read {readPct}%</span>
        <span>Sent {totalSent}</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden relative">
        <div className="h-full bg-blue-300 rounded-full" style={{ width: `${deliveredPct}%` }} />
        <div className="h-full bg-blue-600 rounded-full absolute top-0 left-0" style={{ width: `${readPct}%` }} />
      </div>
    </div>
  );
}

export function CampaignSnapshot(): JSX.Element {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/campaign-snapshot`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: SnapshotData }).data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken]);

  if (loading) return <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Campaign Snapshot</h3>
        <Link href="/campaigns" className="text-xs text-blue-600 hover:underline">View all</Link>
      </div>

      {data?.lastCampaign ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Last Sent</p>
            <p className="text-sm font-medium text-gray-900 truncate">{data.lastCampaign.name}</p>
            <p className="text-xs text-gray-400">{new Date(data.lastCampaign.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
          </div>
          <DeliveryBar
            delivered={data.lastCampaign.delivered}
            read={data.lastCampaign.read}
            totalSent={data.lastCampaign.totalSent}
          />
          {data.lastCampaign.failed > 0 && (
            <p className="text-xs text-red-500">{data.lastCampaign.failed} failed</p>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-400">No campaigns sent yet</p>
          <Link href="/campaigns/new" className="mt-1 inline-block text-xs text-blue-600 hover:underline">Create Campaign</Link>
        </div>
      )}

      {data?.nextScheduled && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-1">Next Scheduled</p>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{data.nextScheduled.name}</p>
              <p className="text-xs text-gray-400">
                {new Date(data.nextScheduled.scheduledAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <span className="ml-2 shrink-0 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {data.nextScheduled.recipientCount} recipients
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
