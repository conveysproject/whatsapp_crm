"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface DailyVolume { date: string; inbound: number; outbound: number; }

interface ConversationChartProps {
  days?: number;
}

export function ConversationChart({ days = 14 }: ConversationChartProps): JSX.Element {
  const [data, setData] = useState<DailyVolume[]>([]);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/conversations?days=${days}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
      if (res.ok) setData((await res.json() as { data: DailyVolume[] }).data);
    }
    void load();
  }, [getToken, days]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Message Volume ({days} days)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inbound" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outbound" fill="#86efac" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
