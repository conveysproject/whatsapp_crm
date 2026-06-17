"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConversations, useSearchConversations } from "@/hooks/useConversations";
import { IntentBadge } from "@/components/intent-badge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const STATUS_TABS = ["all", "open", "pending", "closed"] as const;
type StatusTab = typeof STATUS_TABS[number];

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ConversationList({ selectedId, onSelect }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { getToken } = useAuth();

  const isSearching = searchQuery.trim().length >= 2;
  const { data: conversations, isLoading: listLoading } = useConversations(
    isSearching ? undefined : (activeTab === "all" ? undefined : activeTab)
  );
  const { data: searchResults, isLoading: searchLoading } = useSearchConversations(searchQuery);

  const items = isSearching ? (searchResults ?? []) : (conversations ?? []);
  const isLoading = isSearching ? searchLoading : listLoading;

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
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-200 shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-8 pr-7 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Status tabs — hidden while searching */}
      {!isSearching && (
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
      )}

      {/* List */}
      <div className="flex flex-col overflow-y-auto flex-1">
        {isLoading && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !items.length && (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            {isSearching ? "No results" : "No conversations"}
          </div>
        )}

        {items.map((conv) => {
          const displayName =
            conv.contact
              ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(" ") || `+${conv.contact.phoneNumber}`
              : conv.whatsappContactId ? `+${conv.whatsappContactId}` : "Unknown";

          const lastMsgPreview = conv.lastMessage?.body
            ? (conv.lastMessage.direction === "outbound" ? "✓✓ " : "") +
              conv.lastMessage.body.slice(0, 60) + (conv.lastMessage.body.length > 60 ? "…" : "")
            : null;

          return (
            <button
              key={conv.id}
              onClick={() => { void handleSelect(conv.id); }}
              className={[
                "flex flex-col gap-0.5 px-4 py-3 text-left border-b border-gray-100 transition-colors",
                selectedId === conv.id ? "bg-brand-50" : "hover:bg-gray-50",
              ].join(" ")}
            >
              {/* Row 1: name + time */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
                <span className="text-xs text-gray-400 shrink-0">{formatTime(conv.lastMessageAt)}</span>
              </div>

              {/* Row 2: last message preview + unread badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 truncate flex-1">
                  {lastMsgPreview ?? (
                    <span className={`capitalize ${conv.status === "open" ? "text-brand-600" : "text-gray-400"}`}>
                      {conv.status}
                    </span>
                  )}
                </span>
                {conv.unreadCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                  </span>
                )}
              </div>

              {/* Row 3: intent tag (renders only if cached) */}
              {conv.lastMessage?.id && conv.lastMessage.direction === "inbound" && conv.lastMessage.body && (
                <IntentBadge
                  messageId={conv.lastMessage.id}
                  text={conv.lastMessage.body}
                  direction="inbound"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
