"use client";
import { JSX, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface CannedResponse {
  id: string;
  name: string;
  shortcut: string | null;
  content: string;
  mediaData: { fileUrl: string; type: string; title: string } | null;
}

interface Props {
  conversationId: string | null;
  onSelect: (content: string) => void;
  onSent?: () => void;
}

export function CannedResponsePicker({ conversationId, onSelect, onSent }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const { data } = useQuery<{ data: CannedResponse[] }>({
    queryKey: ["canned-responses"],
    queryFn: () => fetch("/api/v1/canned-responses").then((r) => r.json() as Promise<{ data: CannedResponse[] }>),
    staleTime: 30_000,
  });

  const filtered = (data?.data ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.shortcut ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelect(r: CannedResponse) {
    setOpen(false);
    setSearch("");
    if (r.mediaData && conversationId) {
      try {
        const token = await getToken();
        await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: r.mediaData.type,
            mediaId: r.mediaData.fileUrl,
            filename: r.mediaData.title,
          }),
        });
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        onSent?.();
      } catch {
        // media send failed silently; text still prefills
      }
    }
    onSelect(r.content);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setSearch(""); }}
        className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        title="Canned responses"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-80 bg-white border rounded-lg shadow-lg z-10">
          <div className="flex items-center gap-1 p-2 border-b">
            <input
              autoFocus
              className="flex-1 text-sm px-2 py-1 border rounded"
              placeholder="Search canned responses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setSearch(""); } }}
            />
            <button
              type="button"
              onClick={() => { setOpen(false); setSearch(""); }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="p-3 text-sm text-gray-400">No responses found</li>
            )}
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => { void handleSelect(r); }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.shortcut && <span className="text-xs text-gray-400 font-mono">{r.shortcut}</span>}
                    {r.mediaData && <span className="text-xs text-gray-400">📎 {r.mediaData.type}</span>}
                  </div>
                  <p className="text-gray-500 truncate">{r.content}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
