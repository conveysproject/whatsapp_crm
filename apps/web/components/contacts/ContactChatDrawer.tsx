"use client";

import { JSX, useEffect, useRef, useState, FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Message {
  id: string;
  direction: string;
  contentType: string;
  text: string | null;
  sentAt: string;
}

interface Props {
  contactId: string;
  contactName: string;
  onClose: () => void;
}

export function ContactChatDrawer({ contactId, contactName, onClose }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      if (!token) { setLoadingConv(false); return; }
      const res = await fetch(`${API_URL}/v1/contacts/${contactId}/conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoadingConv(false); return; }
      const json = await res.json() as { data: { id: string } | null };
      if (!json.data) { setLoadingConv(false); return; }
      setConversationId(json.data.id);
      setLoadingConv(false);
      setLoadingMsgs(true);
      const mRes = await fetch(`${API_URL}/v1/conversations/${json.data.id}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mRes.ok) {
        const mJson = await mRes.json() as { data: Message[] };
        setMessages(mJson.data);
      }
      setLoadingMsgs(false);
    })();
  }, [contactId, getToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !conversationId) return;
    setSending(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "text", text: text.trim() }),
      });
      if (!res.ok) { setError("Failed to send message"); return; }
      const json = await res.json() as { data: Message };
      setMessages((prev) => [...prev, json.data]);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[400px] max-w-full bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 font-semibold text-xs">
              {contactName.slice(0, 2).toUpperCase() || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate text-sm">{contactName}</p>
            <p className="text-xs text-gray-400">Chat</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loadingConv || loadingMsgs ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
          ) : !conversationId ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center px-4">
              No conversation found for this contact yet.
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">No messages yet.</div>
          ) : (
            messages.map((m) => {
              const isOut = m.direction === "outbound";
              return (
                <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isOut ? "bg-[#dcf8c6] text-gray-800 rounded-br-none" : "bg-gray-100 text-gray-800 rounded-bl-none"}`}>
                    <p className="leading-relaxed">{m.text ?? `[${m.contentType}]`}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                      {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {conversationId && (
          <form onSubmit={(e) => { void handleSend(e); }} className="shrink-0 border-t border-gray-200 px-4 py-3">
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex items-center gap-2">
              <input
                className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Type a message…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="h-9 px-4 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
