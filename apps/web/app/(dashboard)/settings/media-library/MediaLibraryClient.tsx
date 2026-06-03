"use client";

import { JSX, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface MediaAsset {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

const TABS = ["all", "image", "video", "document", "audio"] as const;
type Tab = (typeof TABS)[number];

const TYPE_ICONS: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  document: "📄",
  audio: "🎵",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryClient(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"upload" | "url">("upload");
  const [editAsset, setEditAsset] = useState<MediaAsset | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [urlForm, setUrlForm] = useState({ title: "", type: "image", fileUrl: "", description: "" });
  const [editForm, setEditForm] = useState({ title: "", description: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const { data: assets = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["media-assets", activeTab],
    queryFn: async () => {
      const params = activeTab !== "all" ? `?type=${activeTab}` : "";
      const res = await fetch(`${API_URL}/v1/media-assets${params}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return [];
      return (await res.json() as { data: MediaAsset[] }).data;
    },
  });

  async function handleUploadFile(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.[^/.]+$/, ""));
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status === 201 ? resolve() : reject(new Error(xhr.responseText)));
        xhr.onerror = reject;
        void getToken().then((token) => {
          xhr.open("POST", `${API_URL}/v1/media-assets/upload`);
          xhr.setRequestHeader("Authorization", `Bearer ${token ?? ""}`);
          xhr.send(form);
        });
      });
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleAddUrl() {
    if (!urlForm.title || !urlForm.type || !urlForm.fileUrl) return;
    setSaving(true);
    const headers = await authHeaders();
    await fetch(`${API_URL}/v1/media-assets`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: urlForm.title,
        type: urlForm.type,
        fileUrl: urlForm.fileUrl,
        description: urlForm.description || undefined,
      }),
    });
    setSaving(false);
    setAddOpen(false);
    setUrlForm({ title: "", type: "image", fileUrl: "", description: "" });
    void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  async function handleEdit() {
    if (!editAsset || !editForm.title) return;
    setSaving(true);
    const headers = await authHeaders();
    await fetch(`${API_URL}/v1/media-assets/${editAsset.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: editForm.title, description: editForm.description || null }),
    });
    setSaving(false);
    setEditAsset(null);
    void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this media asset? This cannot be undone.")) return;
    setDeleteId(id);
    await fetch(`${API_URL}/v1/media-assets/${id}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    setDeleteId(null);
    void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable media assets for campaigns and flows.</p>
        </div>
        <button
          onClick={() => { setAddOpen(true); setAddTab("upload"); }}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          + Add Media
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
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : assets.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <p className="text-4xl mb-3">📁</p>
          <p>No media assets yet. Click &quot;+ Add Media&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="border rounded-xl bg-white shadow-sm overflow-hidden group">
              <div className="h-32 bg-gray-50 flex items-center justify-center overflow-hidden">
                {asset.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.fileUrl} alt={asset.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">{TYPE_ICONS[asset.type] ?? "📎"}</span>
                )}
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium text-gray-900 truncate">{asset.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
                    {asset.type}
                  </span>
                  {asset.fileSizeBytes !== null && (
                    <span className="text-xs text-gray-400">{formatBytes(asset.fileSizeBytes)}</span>
                  )}
                </div>
                {asset.description && (
                  <p className="text-xs text-gray-400 line-clamp-1">{asset.description}</p>
                )}
              </div>
              <div className="px-3 pb-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditAsset(asset);
                    setEditForm({ title: asset.title, description: asset.description ?? "" });
                  }}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => { void handleDelete(asset.id); }}
                  disabled={deleteId === asset.id}
                  className="text-xs px-3 py-1.5 border border-red-100 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-40"
                >
                  {deleteId === asset.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Media Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold">Add Media</h2>
              <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex border-b border-gray-100">
              {(["upload", "url"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAddTab(tab)}
                  className={[
                    "flex-1 py-2.5 text-sm font-medium transition-colors",
                    addTab === tab ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500",
                  ].join(" ")}
                >
                  {tab === "upload" ? "Upload File" : "Paste URL"}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 space-y-4">
              {addTab === "upload" ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl h-36 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
                  >
                    {uploading ? (
                      <>
                        <div className="w-40 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-600 transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">{uploadProgress}% uploaded…</p>
                      </>
                    ) : (
                      <>
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm text-gray-600 font-medium">Click to select file</p>
                        <p className="text-xs text-gray-400">Images, videos, audio, documents</p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                    <input
                      value={urlForm.title}
                      onChange={(e) => setUrlForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Product brochure"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type <span className="text-red-500">*</span></label>
                    <select
                      value={urlForm.type}
                      onChange={(e) => setUrlForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="document">Document</option>
                      <option value="audio">Audio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">URL <span className="text-red-500">*</span></label>
                    <input
                      value={urlForm.fileUrl}
                      onChange={(e) => setUrlForm((f) => ({ ...f, fileUrl: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="https://…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={urlForm.description}
                      onChange={(e) => setUrlForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setAddOpen(false)}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                    >Cancel</button>
                    <button
                      onClick={() => { void handleAddUrl(); }}
                      disabled={saving || !urlForm.title || !urlForm.fileUrl}
                      className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      {saving ? "Adding…" : "Add"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Edit Media</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditAsset(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => { void handleEdit(); }}
                disabled={saving || !editForm.title}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
