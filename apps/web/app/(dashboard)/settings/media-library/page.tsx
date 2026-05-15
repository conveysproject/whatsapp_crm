"use client";

import { JSX, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface InfoMaterial {
  id: string;
  name: string;
  type: string;
  url: string | null;
  fileUrl: string | null;
  description: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  document: "Document",
  audio: "Audio",
};

const TABS = ["all", "image", "video", "document", "audio"] as const;
type Tab = typeof TABS[number];

export default function MediaLibraryPage(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "image", url: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery<InfoMaterial[]>({
    queryKey: ["info-materials", activeTab],
    queryFn: async () => {
      const token = await getToken();
      const params = activeTab !== "all" ? `?type=${activeTab}` : "";
      const res = await fetch(`${API_URL}/v1/info-materials${params}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: InfoMaterial[] }).data;
    },
  });

  async function handleAdd() {
    if (!form.name || !form.type) return;
    setSaving(true);
    const token = await getToken();
    await fetch(`${API_URL}/v1/info-materials`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, type: form.type, url: form.url || undefined, description: form.description || undefined }),
    });
    setSaving(false);
    setAddOpen(false);
    setForm({ name: "", type: "image", url: "", description: "" });
    void queryClient.invalidateQueries({ queryKey: ["info-materials"] });
  }

  async function handleDelete(id: string) {
    setDeleteId(id);
    const token = await getToken();
    await fetch(`${API_URL}/v1/info-materials/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    setDeleteId(null);
    void queryClient.invalidateQueries({ queryKey: ["info-materials"] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable media assets for campaigns and flows.</p>
        </div>
        <button
          onClick={() => { setAddOpen(true); setTimeout(() => nameRef.current?.focus(), 50); }}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
        >
          Add Media
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={[
              "px-4 py-2 text-sm font-medium capitalize transition-colors",
              activeTab === t ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No media items yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg p-4 bg-white shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                  {TYPE_LABELS[item.type] ?? item.type}
                </span>
              </div>
              {item.description && <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>}
              {(item.url ?? item.fileUrl) && (
                <a
                  href={item.url ?? item.fileUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline truncate block"
                >
                  {item.url ?? item.fileUrl}
                </a>
              )}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => { void handleDelete(item.id); }}
                  disabled={deleteId === item.id}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                >
                  {deleteId === item.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Add Media</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Name *</label>
                <input
                  ref={nameRef}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                  placeholder="Product brochure"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="document">Document</option>
                  <option value="audio">Audio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">URL</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border rounded px-3 py-1.5 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleAdd(); }}
                disabled={saving || !form.name}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
