"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface MessageLog {
  id: string;
  body: string | null;
  direction: string;
  status: string;
  createdAt: string;
  conversation: {
    contact: { firstName: string | null; lastName: string | null; phoneNumber: string } | null;
  } | null;
}

export default function MessageLogPage(): JSX.Element {
  const today = new Date().toISOString().split("T")[0]!;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]!;

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ from, to, page: String(page) });
  if (direction) params.set("direction", direction);

  const { data, isLoading } = useQuery<{ data: MessageLog[]; total: number }>({
    queryKey: ["message-log", from, to, direction, page],
    queryFn: () => fetch(`/api/v1/messages/log?${params}`).then((r) => r.json()),
  });

  const statusColor: Record<string, string> = {
    pending: "text-yellow-600",
    sent: "text-blue-600",
    delivered: "text-green-600",
    read: "text-purple-600",
    failed: "text-red-600",
  };

  const getContactDisplay = (msg: MessageLog): string => {
    const contact = msg.conversation?.contact;
    if (!contact) return "Unknown";
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    return name || contact.phoneNumber;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Message Log</h1>

      <div className="flex flex-wrap gap-4 items-end border rounded-lg p-4 bg-gray-50">
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Direction</label>
          <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">All</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <p className="text-sm text-gray-500 ml-auto">{data?.total ?? 0} messages</p>
      </div>

      <div className="border rounded-lg divide-y">
        {isLoading && <p className="p-6 text-center text-sm text-gray-400">Loading...</p>}
        {!isLoading && (data?.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No messages in this range.</p>
        )}
        {(data?.data ?? []).map((msg) => (
          <div key={msg.id} className="flex items-start justify-between p-4 gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{getContactDisplay(msg)}</p>
              <p className="text-sm text-gray-600 truncate mt-0.5">{msg.body ?? ""}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`text-xs font-medium capitalize ${statusColor[msg.status] ?? "text-gray-500"}`}>{msg.status}</span>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(msg.createdAt).toLocaleString("en-IN")}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded ${msg.direction === "inbound" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
                {msg.direction}
              </span>
            </div>
          </div>
        ))}
      </div>

      {data && data.total > 50 && (
        <div className="flex justify-between items-center text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border rounded disabled:opacity-40">Previous</button>
          <span className="text-gray-500">Page {page} of {Math.ceil(data.total / 50)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(data.total / 50)} className="px-3 py-1.5 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
