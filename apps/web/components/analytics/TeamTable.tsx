"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface AgentStat { assignedTo: string; conversationsHandled: number; }

export function TeamTable(): JSX.Element {
  const [data, setData] = useState<AgentStat[]>([]);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/team`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setData((await res.json() as { data: AgentStat[] }).data);
    }
    void load();
  }, [getToken]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Team Performance</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-5 py-2 font-medium text-gray-600">Agent</th>
            <th className="text-right px-5 py-2 font-medium text-gray-600">Conversations</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.length === 0 ? (
            <tr><td colSpan={2} className="px-5 py-6 text-center text-gray-400">No data yet</td></tr>
          ) : (
            data.map((row) => (
              <tr key={row.assignedTo}>
                <td className="px-5 py-2 text-gray-900 font-mono text-xs">{row.assignedTo}</td>
                <td className="px-5 py-2 text-right text-gray-900">{row.conversationsHandled}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
