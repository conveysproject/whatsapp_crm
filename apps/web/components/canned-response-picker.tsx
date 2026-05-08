"use client";
import { JSX, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface CannedResponse {
  id: string;
  name: string;
  shortcut: string | null;
  content: string;
}

interface Props {
  onSelect: (content: string) => void;
}

export function CannedResponsePicker({ onSelect }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery<{ data: CannedResponse[] }>({
    queryKey: ["canned-responses"],
    queryFn: () => fetch("/api/v1/canned-responses").then((r) => r.json() as Promise<{ data: CannedResponse[] }>),
  });

  const filtered = (data?.data ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.shortcut ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        title="Canned responses"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute bottom-14 left-0 w-80 bg-white border rounded-lg shadow-lg z-10">
      <div className="p-2 border-b">
        <input
          autoFocus
          className="w-full text-sm px-2 py-1 border rounded"
          placeholder="Search canned responses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
              onClick={() => { onSelect(r.content); setOpen(false); setSearch(""); }}
            >
              <span className="font-medium">{r.name}</span>
              {r.shortcut && <span className="ml-2 text-xs text-gray-400">{r.shortcut}</span>}
              <p className="text-gray-500 truncate">{r.content}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
