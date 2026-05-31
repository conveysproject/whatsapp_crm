"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface CampaignAnalyticsItem {
  id: string;
  name: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
}

function DeliveryBar({ deliveryRate, readRate }: { deliveryRate: number; readRate: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="h-full bg-blue-200 rounded-full" style={{ width: `${deliveryRate}%` }} />
        <div className="h-full bg-blue-600 rounded-full absolute top-0 left-0" style={{ width: `${readRate}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums shrink-0">{deliveryRate}%</span>
    </div>
  );
}

interface CampaignsTabProps {
  days: number;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function CampaignsTab({ days }: CampaignsTabProps): JSX.Element {
  const { getToken } = useAuth();
  const [data, setData] = useState<CampaignAnalyticsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/campaigns?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          setData((await res.json() as { data: CampaignAnalyticsItem[] }).data);
        } else {
          setError("Failed to load campaign data.");
        }
      } catch {
        setError("Network error loading campaigns.");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    void load();
  }, [getToken, days]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {data.length === 0 && !error ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">No campaigns sent in the last {days} days.</p>
          <Link href="/campaigns/new" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Campaign</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Sent</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Delivered</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Read</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Failed</th>
                  <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Delivery Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 truncate block max-w-[200px]">
                        {c.name}
                      </Link>
                      <span className="text-xs text-gray-400">
                        {new Date(c.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{c.totalSent}</td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{c.delivered}</td>
                    <td className="px-4 py-3 text-right text-blue-700 font-medium tabular-nums">{c.read}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${c.failed > 0 ? "text-red-500" : "text-gray-400"}`}>
                      {c.failed}
                    </td>
                    <td className="px-4 py-3">
                      <DeliveryBar deliveryRate={c.deliveryRate} readRate={c.readRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
