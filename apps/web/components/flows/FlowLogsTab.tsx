"use client";

import { JSX } from "react";

interface FlowRun {
  id: string;
  contactPhone: string | null;
  conversationId: string | null;
  status: string;
  stepsExecuted: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface FlowLogsTabProps {
  runs: FlowRun[];
  loading: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const STATUS_CLASSES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-blue-100 text-blue-700",
  failed:    "bg-red-100 text-red-700",
};

export function FlowLogsTab({ runs, loading }: FlowLogsTabProps): JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading run history…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-4xl">📋</span>
        <p className="text-sm text-gray-500">No runs yet. Activate the flow to start collecting history.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="pb-2 pr-4">Triggered</th>
            <th className="pb-2 pr-4">Contact</th>
            <th className="pb-2 pr-4">Steps</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{timeAgo(run.startedAt)}</td>
              <td className="py-2 pr-4 font-mono text-gray-700">{run.contactPhone ?? "—"}</td>
              <td className="py-2 pr-4 text-gray-700">{run.stepsExecuted}</td>
              <td className="py-2 pr-4">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[run.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {run.status}
                </span>
              </td>
              <td className="py-2 text-xs text-red-500 truncate max-w-[200px]">{run.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
