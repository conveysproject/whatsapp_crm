"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
  contactName: string;
  onClose: () => void;
}

export function ContactChatDrawer({ contactId, contactName, onClose }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${API_URL}/v1/contacts/${contactId}/conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { data: { id: string } | null };
        setConversationId(json.data?.id ?? null);
      }
      setLoading(false);
    })();
  }, [contactId, getToken]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full bg-white shadow-2xl flex flex-col">
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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="flex-1 overflow-hidden">
              <MessageThread conversationId={conversationId} />
            </div>
            <SendMessageForm conversationId={conversationId} />
          </>
        )}
      </div>
    </>
  );
}
