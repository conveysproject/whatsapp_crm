"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

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
        action?: { buttons?: Array<{ reply?: { title?: string } }>; button?: string };
      };
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

export default function MessageLogPage(): JSX.Element {
  const { getToken } = useAuth();
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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Message Log</h1>

      <div className="flex flex-wrap gap-4 items-end bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date" value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Direction</label>
          <select
            value={direction}
            onChange={(e) => { setDirection(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
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
                      {new Date(msg.createdAt).toLocaleString("en-IN")}
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
    </div>
  );
}
