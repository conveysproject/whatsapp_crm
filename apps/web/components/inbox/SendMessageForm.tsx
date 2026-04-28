"use client";

import { JSX, FormEvent, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Props {
  conversationId: string | null;
  prefillText?: string;
  onSent?: () => void;
}

export function SendMessageForm({ conversationId, prefillText, onSent }: Props): JSX.Element {
  const [text, setText] = useState("");

  useEffect(() => {
    if (prefillText) setText(prefillText);
  }, [prefillText]);
  const [sending, setSending] = useState(false);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim()) return;

    setSending(true);
    try {
      const token = await getToken();
      const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const res = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": "application/json",
        },
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

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="flex gap-2 p-3 border-t border-gray-200 bg-white">
      <Input
        className="flex-1"
        placeholder={conversationId ? "Type a message…" : "Select a conversation first"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!conversationId || sending}
      />
      <Button type="submit" disabled={!conversationId || !text.trim() || sending}>
        {sending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
