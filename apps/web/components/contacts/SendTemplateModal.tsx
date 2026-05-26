"use client";

import { JSX, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface TemplateComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; text?: string }>;
}

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: TemplateComponent[];
}

interface Props {
  contactId: string;
  onClose: () => void;
  onSent: () => void;
}

const CATEGORY_COLOR: Record<string, string> = {
  marketing:      "bg-purple-100 text-purple-700",
  utility:        "bg-blue-100 text-blue-700",
  authentication: "bg-amber-100 text-amber-700",
};

function getPreview(components: TemplateComponent[]) {
  const header = components.find((c) => c.type?.toUpperCase() === "HEADER");
  const body   = components.find((c) => c.type?.toUpperCase() === "BODY");
  const footer = components.find((c) => c.type?.toUpperCase() === "FOOTER");
  const btns   = components.find((c) => c.type?.toUpperCase() === "BUTTONS");
  const bodyText = (body?.text ?? "").replace(/\{\{\d+\}\}/g, (m) => {
    const idx = parseInt(m.replace(/[{}]/g, ""), 10);
    return ["[Name]", "[Phone]", "[Email]"][idx - 1] ?? m;
  });
  return {
    header: header?.format === "TEXT" ? (header.text ?? null) : header ? `[${header.format ?? "MEDIA"}]` : null,
    body:   bodyText || "—",
    footer: footer?.text ?? null,
    buttons: (btns?.buttons ?? []).map((b) => b.text ?? ""),
  };
}

export function SendTemplateModal({ contactId, onClose, onSent }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/templates`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Template[] }).data.filter((t) => t.status === "approved");
    },
  });

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.components.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function sendTemplate(templateId: string) {
    setSending(templateId);
    setSendError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/templates/${templateId}/send-to-contact`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, variables: [] }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setSendError(json.error?.message ?? "Failed to send");
        return;
      }
      onSent();
      onClose();
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start p-6 pointer-events-none">
      <div className="pointer-events-auto relative w-[420px]">
        <div className="w-[420px] max-h-[480px] bg-white rounded-2xl border border-gray-200 shadow-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Send Template</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
                onKeyDown={(e) => e.key === "Escape" && onClose()}
              />
            </div>
          </div>

          {sendError && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">{sendError}</div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400">
                {search ? "No templates match your search" : "No approved templates"}
              </div>
            ) : (
              filtered.map((t) => {
                const preview = getPreview(t.components);
                const isSending = sending === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { void sendTemplate(t.id); }}
                    disabled={!!sending}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-60 group"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-green-700 transition-colors">
                        {t.name}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${CATEGORY_COLOR[t.category.toLowerCase()] ?? "bg-gray-100 text-gray-600"}`}>
                        {t.category}
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400">{t.language}</span>
                    </div>
                    <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none px-3 py-2 text-xs text-gray-800 max-w-sm">
                      {preview.header && <p className="font-semibold mb-1">{preview.header}</p>}
                      <p className="leading-relaxed">{preview.body}</p>
                      {preview.footer && <p className="text-gray-500 mt-1 text-[11px]">{preview.footer}</p>}
                      {preview.buttons.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 flex flex-wrap gap-1">
                          {preview.buttons.map((btn, i) => (
                            <span key={i} className="px-2 py-0.5 bg-white rounded-full text-[11px] text-green-700 border border-green-200">{btn}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isSending && <p className="text-[11px] text-green-600 mt-1.5">Sending…</p>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
