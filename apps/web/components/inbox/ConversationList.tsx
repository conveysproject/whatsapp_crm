"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConversations } from "@/hooks/useConversations";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const STATUS_TABS = ["all", "open", "pending", "closed"] as const;
type StatusTab = typeof STATUS_TABS[number];

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function ConversationList({ selectedId, onSelect }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const { data: conversations, isLoading } = useConversations(activeTab === "all" ? undefined : activeTab);
  const { getToken } = useAuth();

  async function handleSelect(id: string) {
    onSelect(id);
    try {
      const token = await getToken();
      void fetch(`${API_URL}/v1/conversations/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    } catch { /* non-critical */ }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 shrink-0">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              "flex-1 py-2 text-xs font-medium capitalize transition-colors",
              activeTab === tab
                ? "text-brand-600 border-b-2 border-brand-600"
                : "text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-col overflow-y-auto flex-1">
        {isLoading && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !conversations?.length && (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            No conversations
          </div>
        )}

        {conversations?.map((conv) => {
          const displayName =
            conv.contact
              ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(" ") || `+${conv.contact.phoneNumber}`
              : conv.whatsappContactId ? `+${conv.whatsappContactId}` : "Unknown";

          return (
            <button
              key={conv.id}
              onClick={() => { void handleSelect(conv.id); }}
              className={[
                "flex flex-col gap-1 px-4 py-3 text-left border-b border-gray-100 transition-colors",
                selectedId === conv.id ? "bg-brand-50" : "hover:bg-gray-50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {conv.unreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatTime(conv.lastMessageAt)}</span>
                </div>
              </div>
              <span className={`text-xs capitalize ${conv.status === "open" ? "text-brand-600" : "text-gray-400"}`}>
                {conv.status}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
