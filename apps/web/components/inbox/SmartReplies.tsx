"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface SmartRepliesProps {
  conversationId: string | null;
  onSelect: (text: string) => void;
}

export function SmartReplies({ conversationId, onSelect }: SmartRepliesProps): JSX.Element {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    if (!conversationId) { setSuggestions([]); return; }

    async function fetchSuggestions() {
      setLoading(true);
      try {
        const token = await getToken();
        const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        const res = await fetch(`${api}/v1/conversations/${conversationId}/suggestions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) return;
        const json = await res.json() as { data: { suggestions: string[] } };
        setSuggestions(json.data.suggestions);
      } finally {
        setLoading(false);
      }
    }

    void fetchSuggestions();
  }, [conversationId, getToken]);

  if (!conversationId || (!loading && suggestions.length === 0)) return <></>;

  return (
    <div className="flex gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200 flex-wrap">
      <span className="text-xs text-gray-400 self-center shrink-0">✨ AI:</span>
      {loading ? (
        <>
          {[60, 80, 72].map((w) => (
            <div key={w} style={{ width: w }} className="h-7 rounded-full bg-gray-200 animate-pulse" />
          ))}
        </>
      ) : (
        suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-300 text-gray-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
          >
            {s}
          </button>
        ))
      )}
    </div>
  );
}
