"use client";
import { JSX, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

function useAdminFetch() {
  const { getToken } = useAuth();
  return async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? ""}`,
        ...init?.headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  };
}

const ACTION_COLOR: Record<string, string> = {
  "bootstrap": "bg-purple-100 text-purple-700",
  "superadmin.create": "bg-blue-100 text-blue-700",
  "superadmin.deactivate": "bg-orange-100 text-orange-700",
  "org.ban": "bg-red-100 text-red-700",
  "org.unban": "bg-green-100 text-green-700",
  "org.impersonate": "bg-yellow-100 text-yellow-700",
  "org.patch": "bg-gray-100 text-gray-700",
};

export default function AuditLogsPage(): JSX.Element {
  const adminFetch = useAdminFetch();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");

  const { data, isLoading } = useQuery<{ data: AuditLog[]; total: number }>({
    queryKey: ["audit-logs", page, actionFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (actionFilter) params.set("action", actionFilter);
      return adminFetch(`/v1/admin/audit-logs?${params.toString()}`);
    },
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Immutable record of all admin actions</p>
        </div>
        <p className="text-sm text-gray-500">{total.toLocaleString()} total events</p>
      </div>

      <input
        className="w-full max-w-sm border rounded px-3 py-2 text-sm font-mono"
        placeholder="Filter by action (e.g. org.ban)"
        value={actionFilter}
        onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="border rounded-lg divide-y text-sm">
            {logs.length === 0 && (
              <p className="p-4 text-gray-400">No audit events found.</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className="p-4 flex items-start gap-4">
                <div className="flex-shrink-0 w-40 text-xs text-gray-400 pt-0.5">
                  {new Date(log.createdAt).toLocaleString("en-IN")}
                </div>
                <div className="flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLOR[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                    {log.action}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  {log.targetType && log.targetId && (
                    <p className="text-xs text-gray-500 truncate">
                      {log.targetType}: <span className="font-mono">{log.targetId}</span>
                    </p>
                  )}
                  {log.metadata && (
                    <pre className="text-xs text-gray-400 mt-1 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
                <div className="flex-shrink-0 text-xs text-gray-400 font-mono text-right">
                  <p>{log.ipAddress ?? "—"}</p>
                  <p className="truncate w-32" title={log.actorId}>{log.actorId.slice(0, 8)}…</p>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
