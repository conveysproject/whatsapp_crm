"use client";

import { JSX, FormEvent, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { InteractiveMessagePicker } from "./InteractiveMessagePicker";
import type { InteractivePayload } from "./InteractiveMessagePicker";

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
  const [interactiveOpen, setInteractiveOpen] = useState(false);
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

  async function handleInteractiveSend(payload: InteractivePayload) {
    if (!conversationId) return;
    setInteractiveOpen(false);
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "interactive", interactive: payload }),
      });
      if (res.ok) {
        onSent?.();
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    } finally {
      setSending(false);
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
    <form
      onSubmit={(e) => { void handleSubmit(e); }}
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{ backgroundColor: "var(--wa-sidebar)", borderTop: "1px solid var(--wa-border)" }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { void handleFileSelected(e); }}
      />

      {/* Left icons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Emoji placeholder */}
        <button
          type="button"
          disabled={!conversationId}
          className="p-2 rounded-full transition-colors disabled:opacity-40"
          style={{ color: "var(--wa-icon)" }}
          title="Emoji"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-3.5-7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm7 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm-6.5 3.5c.69 1.076 1.78 1.75 3 1.75s2.31-.674 3-1.75H9z"/>
          </svg>
        </button>

        {/* Interactive message picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setInteractiveOpen((v) => !v); setAttachMenuOpen(false); }}
            disabled={!conversationId || sending || uploading}
            className="p-2 rounded-full transition-colors disabled:opacity-40"
            style={{ color: "var(--wa-icon)" }}
            title="Send interactive message"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>
          {interactiveOpen && (
            <InteractiveMessagePicker
              onSend={(payload) => { void handleInteractiveSend(payload); }}
              onClose={() => setInteractiveOpen(false)}
            />
          )}
        </div>

        {/* Attachment menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAttachMenuOpen((v) => !v)}
            disabled={!conversationId || uploading}
            className="p-2 rounded-full transition-colors disabled:opacity-40"
            style={{ color: "var(--wa-icon)" }}
            title="Attach file"
          >
            {uploading ? (
              <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4M4 12h4m8 0h4" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
          </button>

          {attachMenuOpen && (
            <div
              className="absolute bottom-full left-0 mb-2 w-44 rounded-xl shadow-lg overflow-hidden z-10"
              style={{ backgroundColor: "var(--wa-sidebar)", border: "1px solid var(--wa-border)" }}
            >
              {(["image", "video", "document", "audio"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => openFilePicker(type)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm capitalize transition-colors"
                  style={{ color: "var(--wa-text-primary)" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--wa-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                >
                  <AttachIcon type={type} />
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Text input */}
      <input
        className="flex-1 rounded-full px-4 py-2 text-sm outline-none transition-colors"
        style={{
          backgroundColor: "var(--wa-input)",
          color: "var(--wa-text-primary)",
        }}
        placeholder={conversationId ? "Type a message" : "Select a conversation first"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!conversationId || sending || uploading}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit(e as unknown as React.FormEvent);
          }
        }}
      />

      {/* Send / Mic button */}
      <button
        type="submit"
        disabled={!conversationId || !text.trim() || sending || uploading}
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
        style={{ backgroundColor: "var(--wa-green)" }}
      >
        {sending ? (
          <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : text.trim() ? (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        )}
      </button>
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
