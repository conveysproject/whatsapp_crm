"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface MediaAsset {
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

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  filterType?: "image" | "video" | "document" | "audio";
}

export function MediaAssetPicker({ open, onClose, onSelect, filterType }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(filterType ?? "all");
  const [search, setSearch] = useState("");

  const { data: assets = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["media-assets", activeTab],
    queryFn: async () => {
      const token = await getToken();
      const params = activeTab !== "all" ? `?type=${activeTab}` : "";
      const res = await fetch(`${API_URL}/v1/media-assets${params}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: MediaAsset[] }).data;
    },
    enabled: open,
  });

  const filtered = assets.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()),
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Choose from Media Library</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Search + tabs */}
        <div className="px-6 pt-4 pb-0 shrink-0 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400"
          />
          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={[
                  "px-3 py-2 text-sm font-medium capitalize transition-colors",
                  activeTab === t ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm space-y-2">
              <p className="text-3xl">📁</p>
              <p>No media assets found.</p>
              <Link
                href="/settings/media-library"
                onClick={onClose}
                className="text-brand-600 hover:underline text-xs"
              >
                Go to Media Library to add assets →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => { onSelect(asset); onClose(); }}
                  className="border rounded-xl overflow-hidden text-left hover:border-brand-400 hover:shadow-md transition-all"
                >
                  <div className="h-24 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {asset.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.fileUrl} alt={asset.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{TYPE_ICONS[asset.type] ?? "📎"}</span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-gray-800 truncate">{asset.title}</p>
                    <p className="text-xs text-gray-400 capitalize">{asset.type}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
