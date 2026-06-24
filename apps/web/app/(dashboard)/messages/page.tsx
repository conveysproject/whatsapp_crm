"use client";

import { JSX, useState } from "react";
import { PermissionGate } from "@/components/PermissionGate";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface MessageLog {
  id: string;
  body: string | null;
  contentType: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
  conversation: {
    contact: { firstName: string | null; lastName: string | null; phoneNumber: string } | null;
  } | null;
}

interface GapRow {
  id: string;
  wamid: string;
  fromPhone: string;
  contentType: string;
  body: string | null;
  queued: boolean;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  sending:   "bg-gray-100 text-gray-600",
  sent:      "bg-blue-50 text-blue-600",
  delivered: "bg-green-50 text-green-700",
  read:      "bg-purple-50 text-purple-700",
  failed:    "bg-red-50 text-red-600",
  pending:   "bg-yellow-50 text-yellow-600",
};

const MEDIA_LABEL: Record<string, string> = {
  image:    "🖼️ Image",
  video:    "🎥 Video",
  document: "📄 Document",
  audio:    "🎵 Audio",
  voice:    "🎙️ Voice note",
  sticker:  "🎭 Sticker",
};

function parseBody(contentType: string, body: string | null): JSX.Element {
  if (!body) {
    return <span className="text-gray-400">{MEDIA_LABEL[contentType] ?? "—"}</span>;
  }

  if (contentType === "template") {
    try {
      const t = JSON.parse(body) as {
        templateName?: string;
        header?: { text?: string };
        body?: string;
        footer?: string;
        buttons?: Array<{ text?: string }>;
      };
      return (
        <div className="space-y-0.5">
          {t.templateName && (
            <span className="inline-block text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 rounded px-1.5 py-0.5 mr-1">
              {t.templateName}
            </span>
          )}
          {t.header?.text && <span className="text-sm font-medium text-gray-900">{t.header.text} </span>}
          {t.body && <p className="text-sm text-gray-700 line-clamp-2">{t.body}</p>}
          {t.footer && <p className="text-xs text-gray-400">{t.footer}</p>}
          {t.buttons && t.buttons.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {t.buttons.map((b, i) => (
                <span key={i} className="text-xs border border-gray-300 rounded-full px-2 py-0.5 text-gray-600">
                  {b.text ?? "Button"}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    } catch { /* fall through */ }
  }

  if (contentType === "interactive") {
    try {
      const ia = JSON.parse(body) as {
        header?: { text?: string };
        body?: { text?: string };
        footer?: { text?: string };
        button_reply?: { title?: string };
        list_reply?: { title?: string };
        action?: { buttons?: Array<{ reply?: { title?: string } }>; button?: string };
      };
      const replyTitle = ia.button_reply?.title ?? ia.list_reply?.title;
      if (replyTitle) return <span className="text-sm text-gray-700">✓ {replyTitle}</span>;
      return (
        <div className="space-y-0.5">
          {ia.header?.text && <p className="text-sm font-medium text-gray-900">{ia.header.text}</p>}
          {ia.body?.text && <p className="text-sm text-gray-700 line-clamp-2">{ia.body.text}</p>}
          {ia.footer?.text && <p className="text-xs text-gray-400">{ia.footer.text}</p>}
          {ia.action?.buttons && ia.action.buttons.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {ia.action.buttons.map((b, i) => (
                <span key={i} className="text-xs border border-gray-300 rounded-full px-2 py-0.5 text-gray-600">
                  {b.reply?.title ?? "Button"}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    } catch { /* fall through */ }
  }

  if (MEDIA_LABEL[contentType]) {
    return (
      <span className="text-sm text-gray-700">
        {MEDIA_LABEL[contentType]}{body ? ` — ${body}` : ""}
      </span>
    );
  }

  return <p className="text-sm text-gray-700 line-clamp-2">{body}</p>;
}

function MessageLogTab(): JSX.Element {
  const { getToken } = useAuth();
  const today = new Date().toLocaleDateString("en-CA");
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ from, to, page: String(page) });
  if (direction) params.set("direction", direction);

  const { data, isLoading } = useQuery<{ data: MessageLog[]; total: number }>({
    queryKey: ["message-log", from, to, direction, page],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/messages/log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return { data: [], total: 0 };
      return res.json() as Promise<{ data: MessageLog[]; total: number }>;
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / 50);

  return (
    <>
      <div className="flex flex-wrap gap-4 items-end bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Direction</label>
          <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">All</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <p className="text-sm text-gray-400 ml-auto">{data?.total ?? 0} messages</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Direction</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            ) : (data?.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No messages in this range.</td></tr>
            ) : (
              (data?.data ?? []).map((msg) => {
                const contact = msg.conversation?.contact;
                const contactName = contact
                  ? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber)
                  : "Unknown";
                return (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{contactName}</td>
                    <td className="px-4 py-3 max-w-xs">{parseBody(msg.contentType, msg.body)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize whitespace-nowrap">{msg.contentType}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${msg.direction === "inbound" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-700"}`}>
                        {msg.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[msg.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {msg.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(msg.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}
    </>
  );
}

function GapsTab(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toLocaleDateString("en-CA");
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requeueResult, setRequeuResult] = useState<string | null>(null);

  const params = new URLSearchParams({ from, to, page: String(page) });

  const { data, isLoading } = useQuery<{ data: GapRow[]; total: number }>({
    queryKey: ["message-gaps", from, to, page],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/messages/gaps?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return { data: [], total: 0 };
      return res.json() as Promise<{ data: GapRow[]; total: number }>;
    },
  });

  const requeue = useMutation({
    mutationFn: async (payload: { wamids?: string[]; all?: boolean }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/messages/gaps/requeue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(payload),
      });
      return res.json() as Promise<{ queued: number }>;
    },
    onSuccess: (result, variables) => {
      setRequeuResult(`Re-queued ${result.queued} message${result.queued !== 1 ? "s" : ""}. They will appear in inbox within a few seconds.`);
      if (!variables.wamids?.length) {
        setSelected(new Set());
      } else {
        setSelected((prev) => { const next = new Set(prev); variables.wamids?.forEach((w) => next.delete(w)); return next; });
      }
      void queryClient.invalidateQueries({ queryKey: ["message-gaps"] });
    },
  });

  const rows = data?.data ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / 50);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.wamid));

  function toggleAll(): void {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); rows.forEach((r) => next.delete(r.wamid)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); rows.forEach((r) => next.add(r.wamid)); return next; });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-4 items-end bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); setRequeuResult(null); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); setRequeuResult(null); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-sm text-gray-400">{data?.total ?? 0} gap{(data?.total ?? 0) !== 1 ? "s" : ""}</p>
          {selected.size > 0 && (
            <button
              onClick={() => requeue.mutate({ wamids: [...selected] })}
              disabled={requeue.isPending}
              className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              Re-queue {selected.size} selected
            </button>
          )}
          {(data?.total ?? 0) > 0 && (
            <button
              onClick={() => requeue.mutate({ all: true })}
              disabled={requeue.isPending}
              className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              Re-queue all (max 500)
            </button>
          )}
        </div>
      </div>

      {requeueResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center justify-between">
          <span>{requeueResult}</span>
          <button onClick={() => setRequeuResult(null)} className="text-green-500 hover:text-green-700 ml-4">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Queued?</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Received</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-gray-500">No gaps found</p>
                  <p className="text-xs text-gray-400 mt-1">All received messages in this range are stored in the inbox.</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={`hover:bg-gray-50 ${selected.has(row.wamid) ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(row.wamid)}
                      onChange={() => setSelected((prev) => { const next = new Set(prev); next.has(row.wamid) ? next.delete(row.wamid) : next.add(row.wamid); return next; })}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{row.fromPhone}</td>
                  <td className="px-4 py-3 max-w-xs">{parseBody(row.contentType, row.body)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 capitalize whitespace-nowrap">{row.contentType}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.queued ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
                      {row.queued ? "queued (worker failed)" : "never queued"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => requeue.mutate({ wamids: [row.wamid] })}
                      disabled={requeue.isPending}
                      className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    >
                      Re-queue
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}
    </>
  );
}

export default function MessageLogPage(): JSX.Element {
  const [tab, setTab] = useState<"log" | "gaps">("log");

  return (
    <PermissionGate permission="inbox_access">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Message Log</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("log")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "log" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          All Messages
        </button>
        <button
          onClick={() => setTab("gaps")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "gaps" ? "border-amber-500 text-amber-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Gaps
        </button>
      </div>

      {tab === "log" ? <MessageLogTab /> : <GapsTab />}
    </div>
    </PermissionGate>
  );
}
