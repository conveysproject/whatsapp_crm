"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

interface SearchResult {
  id: string;
  type: "contact" | "conversation" | "message";
  label: string;
  sub?: string;
  href: string;
}

export function GlobalSearch(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { getToken } = useAuth();

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "";
        const res = await fetch(`${apiUrl}/v1/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) return;
        const json = await res.json() as {
          data: {
            contacts: Array<{ id: string; name: string | null; phoneNumber: string }>;
            conversations: Array<{ id: string; whatsappContactId: string | null; status: string }>;
            messages: Array<{ id: string; conversationId: string; body: string | null }>;
          };
        };
        const mapped: SearchResult[] = [
          ...json.data.contacts.map((c) => ({
            id: c.id,
            type: "contact" as const,
            label: c.name ?? c.phoneNumber,
            sub: c.phoneNumber,
            href: `/contacts/${c.id}`,
          })),
          ...json.data.conversations.map((c) => ({
            id: c.id,
            type: "conversation" as const,
            label: c.whatsappContactId ?? c.id,
            sub: c.status,
            href: `/inbox?conversation=${c.id}`,
          })),
          ...json.data.messages.map((m) => ({
            id: m.id,
            type: "message" as const,
            label: (m.body ?? "").slice(0, 60),
            href: `/inbox?conversation=${m.conversationId}`,
          })),
        ];
        setResults(mapped);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, getToken]);

  function handleSelect(r: SearchResult): void {
    setOpen(false);
    setQuery("");
    router.push(r.href);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 w-48"
      >
        <span>Search</span>
        <kbd className="ml-auto text-xs border border-gray-200 rounded px-1">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts, conversations, messages…"
              className="w-full px-4 py-3 text-sm border-b border-gray-100 focus:outline-none"
            />
            {loading && (
              <div className="px-4 py-3 text-sm text-gray-400">Searching…</div>
            )}
            {!loading && results.length === 0 && query.trim() && (
              <div className="px-4 py-3 text-sm text-gray-400">No results</div>
            )}
            <ul className="max-h-80 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => handleSelect(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 capitalize w-20 text-center shrink-0">
                      {r.type}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{r.label}</div>
                      {r.sub && <div className="text-xs text-gray-400">{r.sub}</div>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
