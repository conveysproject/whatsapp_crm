"use client";

import { JSX, useRef, useState } from "react";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface AttachedMedia {
  mediaId: string;
  contentType: "image" | "video" | "document";
  filename: string;
}

interface MediaAttachProps {
  value: AttachedMedia | null;
  onChange: (media: AttachedMedia | null) => void;
  token: string;
}

export function MediaAttach({ value, onChange, token }: MediaAttachProps): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/v1/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Upload failed");
      }
      const body = await res.json() as { data: { mediaId: string; mimeType: string; filename: string } };
      const ct: "image" | "video" | "document" =
        body.data.mimeType.startsWith("image/") ? "image" :
        body.data.mimeType.startsWith("video/") ? "video" : "document";
      onChange({ mediaId: body.data.mediaId, contentType: ct, filename: body.data.filename });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const icon = value?.contentType === "image" ? "🖼" : value?.contentType === "video" ? "🎥" : "📄";

  return (
    <div className="mt-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={(e) => void handleFile(e)}
      />
      {value ? (
        <div className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span>{icon}</span>
          <span className="flex-1 truncate text-gray-700 text-xs">{value.filename}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-red-500 transition-colors text-xs"
            aria-label="Remove attachment"
          >✕</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline disabled:opacity-50"
        >
          📎 {uploading ? "Uploading…" : "Attach image, video or file"}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

const VARIABLES = [
  { label: "{{first_name}}", insert: "{{first_name}}" },
  { label: "{{last_name}}", insert: "{{last_name}}" },
  { label: "{{full_name}}", insert: "{{full_name}}" },
  { label: "{{phone}}", insert: "{{phone}}" },
];

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

export function MessageTextArea({ label, value, onChange, placeholder, rows = 4 }: Props): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map((v) => (
          <button
            key={v.insert}
            type="button"
            onClick={() => insertAtCursor(v.insert)}
            className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded px-2 py-0.5 font-mono"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** WhatsApp-style message bubble preview */
export function WaBubblePreview({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="bg-green-100 text-gray-800 rounded-lg rounded-tr-none px-3 py-2 max-w-xs text-sm whitespace-pre-wrap shadow-sm">
        {text || <span className="text-gray-400 italic">Your message preview will appear here</span>}
      </div>
    </div>
  );
}
