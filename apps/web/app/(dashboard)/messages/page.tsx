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

interface TemplateParsed {
  templateName?: string;
  header?: { text?: string };
  body?: string;
  footer?: string;
  buttons?: Array<{ text?: string; type?: string }>;
}

interface InteractiveParsed {
  type?: string;
  header?: { text?: string };
  body?: { text?: string };
  footer?: { text?: string };
  action?: {
    buttons?: Array<{ reply?: { title?: string } }>;
    button?: string;
    sections?: Array<{ title?: string }>;
  };
}

const MEDIA_ICON: Record<string, string> = {
  image:    "🖼️ Image",
  video:    "🎥 Video",
  document: "📄 Document",
  audio:    "🎵 Audio",
  voice:    "🎙️ Voice note",
  sticker:  "🎭 Sticker",
};

const STATUS_TICK: Record<string, string> = {
  sending:   "○",
  sent:      "✓",
  delivered: "✓✓",
  read:      "✓✓",
  failed:    "✕",
  pending:   "○",
};

const STATUS_COLOR: Record<string, string> = {
  sending:   "text-gray-400",
  sent:      "text-gray-400",
  delivered: "text-gray-400",
  read:      "text-blue-500",
  failed:    "text-red-500",
  pending:   "text-gray-400",
};

function MessageBubble({ msg }: { msg: MessageLog }): JSX.Element {
  const isOut = msg.direction === "outbound";
  const contact = msg.conversation?.contact;
  const contactName = contact
    ? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber)
    : "Unknown";

  const time = new Date(msg.createdAt).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  function renderContent(): JSX.Element {
    const { body, contentType } = msg;

    // Template message
    if (contentType === "template" && body) {
      try {
        const t = JSON.parse(body) as TemplateParsed;
        return (
          <div className="space-y-1.5">
            {t.templateName && (
              <p className="text-xs font-semibold opacity-60 uppercase tracking-wide">{t.templateName}</p>
            )}
            {t.header?.text && (
              <p className="font-semibold text-sm">{t.header.text}</p>
            )}
            {t.body && <p className="text-sm whitespace-pre-wrap">{t.body}</p>}
            {t.footer && (
              <p className="text-xs opacity-60 border-t border-current/20 pt-1 mt-1">{t.footer}</p>
            )}
            {t.buttons && t.buttons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-current/20">
                {t.buttons.map((b, i) => (
                  <span
                    key={i}
                    className="text-xs border border-current/30 rounded-full px-3 py-1 text-blue-600 bg-white"
                  >
                    {b.text ?? "Button"}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      } catch { /* fall through */ }
    }

    // Interactive message (quick reply / list)
    if (contentType === "interactive" && body) {
      try {
        const ia = JSON.parse(body) as InteractiveParsed;
        return (
          <div className="space-y-1.5">
            {ia.header?.text && (
              <p className="font-semibold text-sm">{ia.header.text}</p>
            )}
            {ia.body?.text && (
              <p className="text-sm whitespace-pre-wrap">{ia.body.text}</p>
            )}
            {ia.footer?.text && (
              <p className="text-xs opacity-60 border-t border-current/20 pt-1 mt-1">{ia.footer.text}</p>
            )}
            {ia.action?.buttons && ia.action.buttons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-current/20">
                {ia.action.buttons.map((b, i) => (
                  <span
                    key={i}
                    className="text-xs border border-current/30 rounded-full px-3 py-1 text-blue-600 bg-white"
                  >
                    {b.reply?.title ?? "Button"}
                  </span>
                ))}
              </div>
            )}
            {ia.action?.button && !ia.action.buttons && (
              <span className="text-xs border border-current/30 rounded-full px-3 py-1 text-blue-600 bg-white">
                {ia.action.button}
              </span>
            )}
          </div>
        );
      } catch { /* fall through */ }
    }

    // Media types
    if (MEDIA_ICON[contentType]) {
      return (
        <p className="text-sm">
          {MEDIA_ICON[contentType]}
          {body ? ` — ${body}` : ""}
        </p>
      );
    }

    // Plain text / fallback
    return <p className="text-sm whitespace-pre-wrap">{body ?? "—"}</p>;
  }

  return (
    <div className={`flex flex-col ${isOut ? "items-end" : "items-start"} gap-0.5`}>
      <p className="text-xs text-gray-400 px-1">{contactName}</p>
      <div
        className={[
          "relative max-w-sm rounded-2xl px-3.5 py-2.5 shadow-sm",
          isOut
            ? "bg-[#dcf8c6] rounded-tr-sm text-gray-900"
            : "bg-white rounded-tl-sm text-gray-900 border border-gray-100",
        ].join(" ")}
      >
        {renderContent()}
        <div className={`flex items-center gap-1 mt-1 ${isOut ? "justify-end" : "justify-start"}`}>
          <span className="text-[10px] text-gray-400">{time}</span>
          {isOut && (
            <span className={`text-[11px] font-bold leading-none ${STATUS_COLOR[msg.status] ?? "text-gray-400"}`}>
              {STATUS_TICK[msg.status] ?? "✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
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

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={to}
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

      {/* Chat feed */}
      <div
        className="rounded-xl border border-gray-200 overflow-hidden"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4d4d4' fill-opacity='0.15'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundColor: "#e5ddd5",
        }}
      >
        <div className="p-4 space-y-3 min-h-48">
          {isLoading && (
            <p className="text-center text-sm text-gray-500 py-8">Loading…</p>
          )}
          {!isLoading && (data?.data ?? []).length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">No messages in this range.</p>
          )}
          {(data?.data ?? []).map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
