"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { TeamLeaderboard } from "./TeamLeaderboard";
import Link from "next/link";

interface AgentConversation {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  status: string;
  lastMessageAt: string;
}

interface AgentDetail {
  resolvedCount: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: AgentConversation[];
}

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function AgentPanel({
  userId,
  days,
  onClose,
}: {
  userId: string;
  days: number;
  onClose: () => void;
}): JSX.Element {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setDetail(null);
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/analytics/agent/${userId}?days=${days}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          setDetail((await res.json() as { data: AgentDetail }).data);
        } else {
          setError("Failed to load agent details.");
        }
      } catch {
        setError("Network error loading agent details.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getToken, userId, days, API_BASE]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Slide-in panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Agent Detail</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
              <button
                onClick={() => { setError(null); setLoading(true); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {detail && !loading && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{detail.resolvedCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Resolved Today</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{formatDuration(detail.avgFirstResponseSecs)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Avg Response</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className={`text-2xl font-bold ${detail.slaBreaches > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {detail.slaBreaches}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">SLA Breaches</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Active Conversations</h3>
                {detail.topConversations.length === 0 ? (
                  <p className="text-sm text-gray-400">No open conversations.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.topConversations.map((conv) => (
                      <Link
                        key={conv.id}
                        href={`/inbox?conversation=${conv.id}`}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessagePreview}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          conv.status === "open" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {conv.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

interface TeamTabProps {
  days: number;
}

export function TeamTab({ days }: TeamTabProps): JSX.Element {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <TeamLeaderboard days={days} onAgentClick={(id) => { setSelectedAgentId(id); }} />
      <p className="text-xs text-gray-400">Click an agent row to see their open conversations and performance detail.</p>

      {selectedAgentId && (
        <AgentPanel
          userId={selectedAgentId}
          days={days}
          onClose={() => { setSelectedAgentId(null); }}
        />
      )}
    </div>
  );
}
