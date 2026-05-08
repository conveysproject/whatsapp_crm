"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface AutoReply {
  id: string;
  name: string;
  triggerType: string;
  triggerKeyword: string;
  isActive: boolean;
}

export function AutoRepliesSection(): JSX.Element {
  const { getToken } = useAuth();
  const [replies, setReplies] = useState<AutoReply[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const apiBase = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/v1/auto-replies`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setReplies((await res.json() as { data: AutoReply[] }).data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDuplicate(id: string): Promise<void> {
    setDuplicating(id);
    try {
      const token = await getToken();
      await fetch(`${apiBase}/v1/auto-replies/${id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await load();
    } finally {
      setDuplicating(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Auto-Replies</h2>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {loading && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>
        )}
        {!loading && replies?.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No auto-replies yet.</p>
        )}
        {replies?.map((ar) => (
          <div key={ar.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{ar.name}</p>
              <p className="text-xs text-gray-500">
                {ar.triggerType.replace(/_/g, " ")} ·{" "}
                <code className="bg-gray-100 px-1 rounded">{ar.triggerKeyword}</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ar.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {ar.isActive ? "Active" : "Inactive"}
              </span>
              <button
                onClick={() => void handleDuplicate(ar.id)}
                disabled={duplicating === ar.id}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded disabled:opacity-50"
              >
                {duplicating === ar.id ? "…" : "Duplicate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
