"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export interface InboxLabelStat {
  id: string;
  name: string;
  color: string;
  count: number;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  initialLabels: InboxLabelStat[];
}

export function InboxLabelsClient({ initialLabels }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [labels, setLabels] = useState<InboxLabelStat[]>(initialLabels);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/inbox-labels/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setLabels((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <p className="text-sm text-blue-800">
          Conversation labels are created directly from the inbox. Delete a label here to remove it from all conversations.
        </p>
      </div>

      {labels.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-sm text-gray-400">
          No labels yet. Assign a label to a conversation from the inbox to create one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Label</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Conversations</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {labels.map((label) => (
                <tr key={label.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{label.count}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { void handleDelete(label.id); }}
                      disabled={deleting === label.id}
                      className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {deleting === label.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
