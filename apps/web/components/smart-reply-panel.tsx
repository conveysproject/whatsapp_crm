"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { clientFetch } from "@/lib/client-fetch";

interface Props {
  conversationId: string;
  onSelect: (text: string) => void;
}

export function SmartReplyPanel({ conversationId, onSelect }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { getToken } = useAuth();

  async function fetchSuggestions(): Promise<void> {
    setLoading(true);
    setSuggestions([]);
    try {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const res = await clientFetch(`${api}/v1/ai/smart-replies`, {
        method: "POST",
        token: token ?? "",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        console.error("smart-replies fetch failed", res.status);
        return;
      }
      const json = await res.json() as { data: { replies: string[] } };
      setSuggestions(json.data.replies ?? []);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen(): void {
    setOpen(true);
    void fetchSuggestions();
  }

  function handleClose(): void {
    setOpen(false);
    setSuggestions([]);
  }

  function handleSelect(text: string): void {
    onSelect(text);
    handleClose();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition-colors"
      >
        {/* lightbulb icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2a7 7 0 0 1 5.292 11.623A5.002 5.002 0 0 1 14 18H10a5.002 5.002 0 0 1-3.292-4.377A7 7 0 0 1 12 2Zm-1 17h2v1a1 1 0 1 1-2 0v-1Zm-1-1h4a3 3 0 0 0 2.83-2H7.17A3 3 0 0 0 10 18Z" />
        </svg>
        AI Replies
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-xl border border-violet-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-violet-100">
            <span className="text-xs font-semibold text-violet-700">Suggested Replies</span>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-3 py-2 flex flex-col gap-1.5 min-h-[60px]">
            {loading ? (
              <p className="text-xs text-gray-400 py-2">Generating suggestions...</p>
            ) : suggestions.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No suggestions available.</p>
            ) : (
              suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-violet-50 text-violet-800 border border-violet-100 hover:bg-violet-100 hover:border-violet-300 transition-colors"
                >
                  {s}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-violet-100 flex justify-end">
            <button
              type="button"
              onClick={() => { void fetchSuggestions(); }}
              disabled={loading}
              className="text-xs text-violet-500 hover:text-violet-700 disabled:opacity-40 transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
