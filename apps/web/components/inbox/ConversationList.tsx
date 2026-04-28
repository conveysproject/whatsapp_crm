"use client";

import { JSX } from "react";
import { useConversations } from "@/hooks/useConversations";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function ConversationList({ selectedId, onSelect }: Props): JSX.Element {
  const { data: conversations, isLoading } = useConversations();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!conversations?.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={[
            "flex flex-col gap-1 px-4 py-3 text-left border-b border-gray-100 transition-colors",
            selectedId === conv.id ? "bg-brand-50" : "hover:bg-gray-50",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900 truncate">
              {conv.whatsappContactId ?? "Unknown"}
            </span>
            <span className="text-xs text-gray-400 shrink-0">
              {formatTime(conv.lastMessageAt)}
            </span>
          </div>
          <span className={`text-xs capitalize ${conv.status === "open" ? "text-brand-600" : "text-gray-400"}`}>
            {conv.status}
          </span>
        </button>
      ))}
    </div>
  );
}
