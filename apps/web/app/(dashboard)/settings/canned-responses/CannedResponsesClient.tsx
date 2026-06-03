"use client";

import { JSX, useState, useTransition } from "react";
import type { CannedResponse } from "./page";
import { MediaAssetPicker, type MediaAsset } from "@/components/media-asset-picker";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  initialItems: CannedResponse[];
}

const EMPTY = { name: "", shortcut: "", content: "" };

async function apiFetch(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return method === "DELETE" ? null : (await res.json() as { data: CannedResponse }).data;
}

export function CannedResponsesClient({ initialItems }: Props): JSX.Element {
  const [items, setItems] = useState<CannedResponse[]>(initialItems);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<MediaAsset | null>(null);

  const filtered = items.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.shortcut ?? "").toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q)
    );
  });

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setShowForm(true);
  }

  function openEdit(item: CannedResponse) {
    setEditing(item);
    setForm({ name: item.name, shortcut: item.shortcut ?? "", content: item.content });
    setError("");
    const md = item.mediaData;
    if (md && typeof md === "object" && "fileUrl" in md) {
      setAttachedMedia({
        id: "",
        title: (md["title"] as string) ?? "",
        description: null,
        type: (md["type"] as string) ?? "image",
        fileUrl: (md["fileUrl"] as string) ?? "",
        mimeType: null,
        fileSizeBytes: null,
        createdAt: "",
      });
    } else {
      setAttachedMedia(null);
    }
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setAttachedMedia(null);
  }

  function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.content.trim()) { setError("Content is required."); return; }
    setError("");
    startTransition(async () => {
      try {
        const payload = {
          name: form.name.trim(),
          shortcut: form.shortcut.trim() || null,
          content: form.content.trim(),
          mediaData: attachedMedia
            ? { fileUrl: attachedMedia.fileUrl, type: attachedMedia.type, title: attachedMedia.title }
            : null,
        };
        if (editing) {
          const updated = await apiFetch(`/canned-responses/${editing.id}`, "PUT", payload) as CannedResponse;
          setItems((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
        } else {
          const created = await apiFetch("/canned-responses", "POST", payload) as CannedResponse;
          setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        }
        closeForm();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this canned response?")) return;
    startTransition(async () => {
      try {
        await apiFetch(`/canned-responses/${id}`, "DELETE");
        setItems((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        alert(e instanceof Error ? e.message : "Delete failed.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, shortcut or content…"
          className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors placeholder-gray-400"
        />
        <button
          onClick={openAdd}
          className="h-9 px-4 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap"
        >
          + Add Response
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            {search
              ? "No results match your search."
              : "No canned responses yet. Click \"+ Add Response\" to create your first."}
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="flex items-start gap-4 px-5 py-4 group hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                  {item.shortcut && (
                    <span className="inline-block bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded font-mono">
                      {item.shortcut}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2 whitespace-pre-wrap">{item.content}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="h-8 px-3 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="h-8 px-3 text-xs text-red-600 border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? "Edit Canned Response" : "New Canned Response"}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Greeting"
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Shortcut <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  value={form.shortcut}
                  onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))}
                  placeholder="e.g. /hi"
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors font-mono"
                />
                <p className="mt-1 text-xs text-gray-400">Type this in the inbox message box to auto-insert the response.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Content <span className="text-red-500">*</span></label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Hi {{first_name}}! How can we help you today?"
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Use <code className="bg-gray-100 px-1 rounded">{"{{first_name}}"}</code> and <code className="bg-gray-100 px-1 rounded">{"{{last_name}}"}</code> as placeholders.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Media Attachment <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {attachedMedia ? (
                  <div className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
                    <span className="text-sm text-gray-700 truncate flex-1">{attachedMedia.title}</span>
                    <span className="text-xs text-gray-400 capitalize">{attachedMedia.type}</span>
                    <button
                      type="button"
                      onClick={() => setAttachedMedia(null)}
                      className="text-gray-400 hover:text-red-500 text-sm leading-none"
                    >×</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
                    className="w-full h-9 px-3 text-sm border border-dashed border-gray-300 rounded-lg hover:border-brand-400 hover:bg-brand-50/30 text-gray-500 transition-colors text-left"
                  >
                    + Attach from Library
                  </button>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeForm}
                className="h-9 px-4 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="h-9 px-5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      <MediaAssetPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(asset) => { setAttachedMedia(asset); setMediaPickerOpen(false); }}
      />
    </div>
  );
}
