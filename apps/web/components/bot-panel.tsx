"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

interface Chatbot {
  id: string;
  name: string;
  startTrigger: string | null;
}

interface Props {
  conversationId: string;
}

export function BotPanel({ conversationId }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [bots, setBots] = useState<Chatbot[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);

  // Get contactId from conversation when expanded
  useEffect(() => {
    if (!expanded || !conversationId) return;
    let cancelled = false;
    async function fetchContactId() {
      const token = await getToken();
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/conversations/${conversationId}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
      if (res.ok && !cancelled) {
        const body = await res.json() as { data: { contactId: string | null } };
        setContactId(body.data.contactId ?? null);
      }
    }
    void fetchContactId();
    return () => { cancelled = true; };
  }, [expanded, conversationId, getToken]);

  // Fetch active bots when contactId is known
  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    async function fetchBots() {
      const token = await getToken();
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/chatbots/active-for/${contactId}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
      if (res.ok && !cancelled) {
        const body = await res.json() as { data: Chatbot[] };
        setBots(body.data);
      }
    }
    void fetchBots();
    return () => { cancelled = true; };
  }, [contactId, getToken]);

  async function handleSend(chatbotId: string) {
    if (!contactId) return;
    setSending(chatbotId);
    try {
      const token = await getToken();
      await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/chatbots/${chatbotId}/quick-send/${contactId}`,
        { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm font-medium text-gray-700"
      >
        <span>Bot Automations</span>
        <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {bots.length === 0 && (
            <p className="text-xs text-gray-400">No active bots for this contact.</p>
          )}
          {bots.map((bot) => (
            <div key={bot.id} className="flex items-center justify-between border rounded-lg p-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{bot.name}</p>
                {bot.startTrigger && (
                  <p className="text-xs text-gray-500">
                    Trigger: <code className="bg-gray-100 px-1 rounded">{bot.startTrigger}</code>
                  </p>
                )}
              </div>
              <button
                onClick={() => void handleSend(bot.id)}
                disabled={sending === bot.id}
                className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {sending === bot.id ? "…" : "Send"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
