"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface PresetMessage {
  id: string;
  name: string;
  content: string;
  category: string;
}

export default function PresetMessagesPage(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: presets = [], isLoading } = useQuery<PresetMessage[]>({
    queryKey: ["preset-messages"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/canned-responses?category=nt_campaign&limit=100`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: PresetMessage[] }).data;
    },
  });

  async function handleCreate() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/canned-responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content: content.trim(), category: "nt_campaign" }),
      });
      setName("");
      setContent("");
      void queryClient.invalidateQueries({ queryKey: ["preset-messages"] });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this preset message?")) return;
    setDeletingId(id);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/canned-responses/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      void queryClient.invalidateQueries({ queryKey: ["preset-messages"] });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Preset Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reusable messages for non-template campaigns. Supports <code>{"{{name}}"}</code>, <code>{"{{phone}}"}</code>, <code>{"{{email}}"}</code>.</p>
        </div>

        {/* Create form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">New Preset</h2>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. May Sale Message"
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Message Body</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Hi {{name}}, here's our latest offer…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <p className="text-xs text-gray-400">{content.length} characters</p>
          </div>
          <Button
            onClick={() => { void handleCreate(); }}
            disabled={saving || !name.trim() || !content.trim()}
          >
            {saving ? "Saving…" : "Save Preset"}
          </Button>
        </div>

        {/* Preset list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-4 space-y-2">
                <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
              </div>
            ))
          ) : presets.length === 0 ? (
            <div className="px-5 py-14 text-center text-gray-400 text-sm">No preset messages yet</div>
          ) : (
            presets.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.content}</p>
                </div>
                <button
                  onClick={() => { void handleDelete(p.id); }}
                  disabled={deletingId === p.id}
                  className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
                >
                  {deletingId === p.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
