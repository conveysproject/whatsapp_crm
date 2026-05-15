"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
  initialSummary: string | null;
}

export function AiSummaryCard({ contactId, initialSummary }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setLoading(true);
    setError(null);
    const token = await getToken();

    // Find the most recent conversation for this contact
    const convRes = await fetch(`${API_URL}/v1/conversations?page=1`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (!convRes.ok) {
      setError("Could not load conversations.");
      setLoading(false);
      return;
    }
    const convJson = await convRes.json() as { data: { id: string; contact?: { id: string } }[] };
    const conv = convJson.data.find((c) => c.contact?.id === contactId);

    if (!conv) {
      setError("No conversations found for this contact.");
      setLoading(false);
      return;
    }

    const res = await fetch(`${API_URL}/v1/conversations/${conv.id}/summarize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });

    if (res.ok) {
      const json = await res.json() as { data: { summary: string } };
      setSummary(json.data.summary);
    } else {
      setError("Failed to generate summary. Make sure ANTHROPIC_API_KEY is configured.");
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-gray-800">AI Summary</h2>
        <button
          onClick={() => { void regenerate(); }}
          disabled={loading}
          className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Regenerate"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {summary ? (
        <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">
          No summary yet. Click &ldquo;Regenerate&rdquo; to generate an AI summary from conversation history.
        </p>
      )}
    </div>
  );
}
