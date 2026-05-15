"use client";

import { JSX, FormEvent, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const ACCEPT_BY_TYPE: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/3gpp",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt",
  audio: "audio/mp4,audio/mpeg,audio/ogg,audio/aac",
};

interface Props {
  conversationId: string | null;
  prefillText?: string;
  onSent?: () => void;
}

export function SendMessageForm({ conversationId, prefillText, onSent }: Props): JSX.Element {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaTypeRef = useRef<string>("document");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (prefillText) setText(prefillText);
  }, [prefillText]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim()) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        setText("");
        onSent?.();
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    } finally {
      setSending(false);
    }
  }

  function openFilePicker(mediaType: string) {
    pendingMediaTypeRef.current = mediaType;
    setAttachMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = ACCEPT_BY_TYPE[mediaType] ?? "*/*";
      fileInputRef.current.click();
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversationId) return;
    e.target.value = "";

    setUploading(true);
    try {
      const token = await getToken();

      // Upload to WhatsApp via our media endpoint
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch(`${API_URL}/v1/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      if (!uploadRes.ok) return;
      const { data: uploaded } = await uploadRes.json() as { data: { mediaId: string; mimeType: string } };

      // Send media message
      const sendRes = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: pendingMediaTypeRef.current,
          mediaId: uploaded.mediaId,
          mimeType: uploaded.mimeType,
          filename: file.name,
        }),
      });
      if (sendRes.ok) {
        onSent?.();
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="flex items-center gap-2 p-3 border-t border-gray-200 bg-white">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { void handleFileSelected(e); }}
      />

      {/* Attachment menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAttachMenuOpen((v) => !v)}
          disabled={!conversationId || uploading}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
          title="Attach file"
        >
          {uploading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4M4 12h4m8 0h4" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          )}
        </button>

        {attachMenuOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-10">
            {(["image", "video", "document", "audio"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => openFilePicker(type)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 capitalize"
              >
                <AttachIcon type={type} />
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      <Input
        className="flex-1"
        placeholder={conversationId ? "Type a message…" : "Select a conversation first"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!conversationId || sending || uploading}
      />
      <Button type="submit" disabled={!conversationId || !text.trim() || sending || uploading}>
        {sending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}

function AttachIcon({ type }: { type: string }): JSX.Element {
  const icons: Record<string, string> = {
    image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    video: "M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
    document: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
    audio: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  };
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[type] ?? icons["document"]!} />
    </svg>
  );
}
