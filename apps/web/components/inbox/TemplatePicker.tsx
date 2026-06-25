"use client";

import { JSX, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-fetch";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface TemplateComponent {
  type?: string;
  format?: string;
  text?: string;
  example?: { header_url?: string[] };
  buttons?: Array<{ type?: string; text?: string }>;
  cards?: Array<{ components?: TemplateComponent[] }>;
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
  conversationId?: string;
  contactId?: string;
  initialSearch?: string;
  onSent: () => void;
  onClose: () => void;
}

const CATEGORY_COLOR: Record<string, string> = {
  marketing:      "bg-purple-100 text-purple-700",
  utility:        "bg-blue-100 text-blue-700",
  authentication: "bg-amber-100 text-amber-700",
};

function getPreview(components: TemplateComponent[]): { header: string | null; body: string; footer: string | null; buttons: string[] } {
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

function needsMediaUrl(components: TemplateComponent[]): boolean {
  const header = components.find((c) => c.type?.toUpperCase() === "HEADER");
  return !!header && ["IMAGE", "VIDEO", "DOCUMENT"].includes((header.format ?? "").toUpperCase());
}

function getCarouselCards(components: TemplateComponent[]): Array<{ components?: TemplateComponent[] }> {
  const carousel = components.find((c) => c.type?.toUpperCase() === "CAROUSEL");
  return carousel?.cards ?? [];
}

function isCarouselWithImages(components: TemplateComponent[]): boolean {
  const cards = getCarouselCards(components);
  return cards.some((card) => {
    const hdr = (card.components ?? []).find((c) => c.type?.toUpperCase() === "HEADER");
    return !!hdr && ["IMAGE", "VIDEO", "DOCUMENT"].includes((hdr.format ?? "").toUpperCase());
  });
}

export function TemplatePicker({ conversationId, contactId, initialSearch = "", onSent, onClose }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [search, setSearch] = useState(initialSearch);
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [carouselUrls, setCarouselUrls] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: async () => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/templates`, {
        token: token ?? "",
        silent: true,
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Template[] }).data.filter((t) => t.status === "approved");
    },
  });

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.components.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleTemplateClick(t: Template) {
    setSendError(null);
    if (isCarouselWithImages(t.components)) {
      const cards = getCarouselCards(t.components);
      setPendingTemplate(t);
      setCarouselUrls(cards.map((card) => {
        const hdr = (card.components ?? []).find((c) => c.type?.toUpperCase() === "HEADER");
        return hdr?.example?.header_url?.[0] ?? "";
      }));
    } else if (needsMediaUrl(t.components)) {
      const header = t.components.find((c) => c.type?.toUpperCase() === "HEADER");
      setPendingTemplate(t);
      setMediaUrl(header?.example?.header_url?.[0] ?? "");
    } else {
      void sendTemplate(t.id, "", []);
    }
  }

  async function sendTemplate(templateId: string, url: string, cardUrls: string[]) {
    setSending(templateId);
    setSendError(null);
    try {
      const token = await getToken();
      const res = contactId
        ? await clientFetch(`${API_URL}/v1/templates/${templateId}/send-to-contact`, {
            method: "POST",
            token: token ?? "",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId,
              variables: [],
              ...(url ? { mediaUrl: url } : {}),
              ...(cardUrls.length > 0 ? { cardMediaUrls: cardUrls } : {}),
            }),
          })
        : await clientFetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
            method: "POST",
            token: token ?? "",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contentType: "template",
              templateId,
              ...(url ? { mediaUrl: url } : {}),
              ...(cardUrls.length > 0 ? { cardMediaUrls: cardUrls } : {}),
            }),
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
      setPendingTemplate(null);
    }
  }

  const isCarousel = pendingTemplate ? isCarouselWithImages(pendingTemplate.components) : false;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[420px] max-h-[480px] bg-white rounded-2xl border border-gray-200 shadow-xl flex flex-col z-20 overflow-hidden">
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

      {/* Media URL prompt */}
      {pendingTemplate && (
        <div className="px-4 py-3 border-b border-gray-100 bg-amber-50 space-y-2">
          {isCarousel ? (
            <>
              <p className="text-xs font-medium text-amber-800">
                This carousel template needs an image URL for each card:
              </p>
              {getCarouselCards(pendingTemplate.components).map((card, i) => {
                const hdr = (card.components ?? []).find((c) => c.type?.toUpperCase() === "HEADER");
                const fmt = hdr?.format?.toLowerCase() ?? "image";
                return (
                  <div key={`${pendingTemplate.id}-${i}`} className="space-y-1">
                    <label className="text-xs text-amber-700 font-medium">Card {i + 1} {fmt} URL</label>
                    <input
                      autoFocus={i === 0}
                      type="url"
                      value={carouselUrls[i] ?? ""}
                      onChange={(e) => {
                        const next = [...carouselUrls];
                        next[i] = e.target.value;
                        setCarouselUrls(next);
                      }}
                      placeholder={`https://example.com/${fmt}.jpg`}
                      className="w-full text-sm border border-amber-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                  </div>
                );
              })}
              <div className="flex gap-2">
                <button
                  onClick={() => void sendTemplate(pendingTemplate.id, "", carouselUrls.map((u) => u.trim()))}
                  disabled={carouselUrls.some((u) => !u.trim()) || !!sending}
                  className="flex-1 text-xs font-medium bg-green-600 text-white rounded-lg py-1.5 hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
                <button onClick={() => setPendingTemplate(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-amber-800">
                This template has an {pendingTemplate.components.find((c) => c.type?.toUpperCase() === "HEADER")?.format?.toLowerCase()} header — paste a public URL:
              </p>
              <input
                autoFocus
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full text-sm border border-amber-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                onKeyDown={(e) => { if (e.key === "Enter" && mediaUrl.trim()) void sendTemplate(pendingTemplate.id, mediaUrl.trim(), []); if (e.key === "Escape") setPendingTemplate(null); }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void sendTemplate(pendingTemplate.id, mediaUrl.trim(), [])}
                  disabled={!mediaUrl.trim() || !!sending}
                  className="flex-1 text-xs font-medium bg-green-600 text-white rounded-lg py-1.5 hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
                <button onClick={() => setPendingTemplate(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
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
                onClick={() => handleTemplateClick(t)}
                disabled={!!sending}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-60 group"
              >
                {/* Name + category */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-gray-900 group-hover:text-green-700 transition-colors">
                    {t.name}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${CATEGORY_COLOR[t.category.toLowerCase()] ?? "bg-gray-100 text-gray-600"}`}>
                    {t.category}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400">{t.language}</span>
                </div>

                {/* WhatsApp-style preview bubble */}
                <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none px-3 py-2 text-xs text-gray-800 max-w-sm">
                  {preview.header && (
                    <p className="font-semibold mb-1">{preview.header}</p>
                  )}
                  <p className="leading-relaxed">{preview.body}</p>
                  {preview.footer && (
                    <p className="text-gray-500 mt-1 text-[11px]">{preview.footer}</p>
                  )}
                  {preview.buttons.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-green-200 flex flex-wrap gap-1">
                      {preview.buttons.map((btn, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white rounded-full text-[11px] text-green-700 border border-green-200">
                          {btn}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {isSending && (
                  <p className="text-[11px] text-green-600 mt-1.5">Sending…</p>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
