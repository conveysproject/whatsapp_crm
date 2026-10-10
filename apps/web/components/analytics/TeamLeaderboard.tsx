"use client";

import { JSX, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { formatDurationCoarse } from "@/lib/format";

interface AgentStats {
  userId: string;
  displayName: string;
  openConversations: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
}

type SortKey = keyof Omit<AgentStats, "userId" | "displayName">;


interface TeamLeaderboardProps {
  days?: number;
  /** Show only the first N agents after sorting (default: all). */
  limit?: number;
  /** When set, the header shows a "View all" link to this path. */
  viewAllHref?: string;
  onAgentClick?: (userId: string) => void;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function TeamLeaderboard(props: TeamLeaderboardProps): JSX.Element {
  const { getToken } = useAuth();
  return <TeamLeaderboardPanel getToken={getToken} {...props} />;
}

/** Same as TeamLeaderboard but with an injected token source (testable without Clerk). */
export function TeamLeaderboardPanel({
  getToken, days = 30, limit, viewAllHref, onAgentClick,
}: TeamLeaderboardProps & { getToken: () => Promise<string | null> }): JSX.Element {
  const [data, setData] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("resolvedToday");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/team?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) setData((await res.json() as { data: AgentStats[] }).data);
        else setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken, days]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sortedAll = [...data].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });
  const sorted = limit === undefined ? sortedAll : sortedAll.slice(0, limit);

  const cols: { key: SortKey; label: string }[] = [
    { key: "openConversations", label: "Open" },
    { key: "resolvedToday", label: "Resolved Today" },
    { key: "avgFirstResponseSecs", label: "Avg Response" },
    { key: "slaBreaches", label: "SLA Breaches" },
  ];

  if (loading) return <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Team Leaderboard</h3>
        {viewAllHref && (
          <Link data-testid="leaderboard-view-all" href={viewAllHref} className="text-xs font-semibold text-green-700 underline underline-offset-2">
            View all
          </Link>
        )}
      </div>
      {error ? (
        <p data-testid="leaderboard-error" className="px-5 py-6 text-center text-sm text-gray-500">Could not load team data</p>
      ) : sorted.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">No activity yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-2 font-medium text-gray-600">Agent</th>
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className="text-right px-4 py-2 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
                    onClick={() => { handleSort(col.key); }}
                  >
                    {col.label} {sortKey === col.key ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((agent) => (
                <tr
                  key={agent.userId}
                  className={`hover:bg-gray-50 ${onAgentClick ? "cursor-pointer" : ""}`}
                  onClick={() => { onAgentClick?.(agent.userId); }}
                >
                  <td className="px-5 py-2.5 font-medium text-gray-900 whitespace-nowrap">{agent.displayName}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{agent.openConversations}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-green-700">{agent.resolvedToday}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatDurationCoarse(agent.avgFirstResponseSecs)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${agent.slaBreaches > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {agent.slaBreaches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
