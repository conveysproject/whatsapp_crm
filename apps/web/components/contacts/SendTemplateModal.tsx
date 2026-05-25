"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { TemplatePicker } from "@/components/inbox/TemplatePicker";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendTemplateModal({ contactId, onClose, onSent }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      if (!token) { setError("Not authenticated"); setLoading(false); return; }
      const res = await fetch(`${API_URL}/v1/contacts/${contactId}/conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load conversation"); setLoading(false); return; }
      const json = await res.json() as { data: { id: string } | null };
      if (!json.data) { setError("No conversation found for this contact. Start a chat first."); setLoading(false); return; }
      setConversationId(json.data.id);
      setLoading(false);
    })();
  }, [contactId, getToken]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start p-6 pointer-events-none">
      <div className="pointer-events-auto relative w-[420px]">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 flex items-center justify-center text-sm text-gray-400">
            Loading conversation…
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">Send Template</span>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : conversationId ? (
          <div className="relative">
            <TemplatePicker
              conversationId={conversationId}
              onSent={onSent}
              onClose={onClose}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
