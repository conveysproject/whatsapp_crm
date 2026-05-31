"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface DailyVolume { date: string; inbound: number; outbound: number; }
interface StatusBreakdown { open: number; pending: number; bot: number; resolved: number; }

const STATUS_COLORS: Record<keyof StatusBreakdown, string> = {
  open: "#3b82f6",
  pending: "#f59e0b",
  bot: "#8b5cf6",
  resolved: "#22c55e",
};

interface ConversationsTabProps {
  days: number;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function ConversationsTab({ days }: ConversationsTabProps): JSX.Element {
  const { getToken } = useAuth();
  const [volume, setVolume] = useState<DailyVolume[]>([]);
  const [status, setStatus] = useState<StatusBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token ?? ""}` };
        const [volRes, statusRes] = await Promise.all([
          fetch(`${API_BASE}/v1/analytics/conversations?days=${days}`, { headers }),
          fetch(`${API_BASE}/v1/analytics/conversation-status?days=${days}`, { headers }),
        ]);
        if (volRes.ok) setVolume((await volRes.json() as { data: DailyVolume[] }).data);
        if (statusRes.ok) setStatus((await statusRes.json() as { data: StatusBreakdown }).data);
        if (!volRes.ok && !statusRes.ok) setError("Failed to load conversation data.");
      } catch {
        setError("Network error loading conversations.");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    void load();
  }, [getToken, days]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const pieData = status
    ? (Object.entries(status) as [keyof StatusBreakdown, number][])
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({ name: key, value }))
    : [];

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line chart — message volume */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Message Volume ({days}d)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={volume} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="inbound" stroke="#22c55e" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="outbound" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Status Breakdown ({days}d)</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center pt-16">No conversations in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name as keyof StatusBreakdown] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
