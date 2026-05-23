"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConversations } from "@/hooks/useConversations";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const STATUS_TABS = ["all", "open", "pending", "closed"] as const;
type StatusTab = typeof STATUS_TABS[number];

interface Props {
  selectedId: string | null;
  onSelect: (id: string, displayName: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit" });
}

function nameInitials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "?";
}

const AVATAR_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "#25D366";
}

export function ConversationList({ selectedId, onSelect }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const { data: conversations, isLoading } = useConversations(activeTab === "all" ? undefined : activeTab);
  const { getToken } = useAuth();

  async function handleSelect(id: string, displayName: string) {
    onSelect(id, displayName);
    try {
      const token = await getToken();
      void fetch(`${API_URL}/v1/conversations/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    } catch { /* non-critical */ }
  }

  const filtered = conversations?.filter(conv => {
    if (!search.trim()) return true;
    const name =
      conv.contact
        ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(" ") || conv.contact.phoneNumber
        : conv.whatsappContactId ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--wa-sidebar)" }}>
      {/* Search bar */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ backgroundColor: "var(--wa-search)" }}>
          <svg className="w-4 h-4 shrink-0" style={{ color: "var(--wa-icon)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--wa-text-primary)" }}
            placeholder="Search or start new chat"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--wa-icon)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-3 pb-2 shrink-0 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="shrink-0 px-3 py-0.5 rounded-full text-xs font-medium capitalize transition-colors"
            style={
              activeTab === tab
                ? { backgroundColor: "var(--wa-green)", color: "#fff" }
                : { backgroundColor: "var(--wa-search)", color: "var(--wa-text-secondary)" }
            }
          >
            {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex flex-col overflow-y-auto flex-1">
        {isLoading && (
          <div className="flex flex-col">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-12 h-12 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: "var(--wa-search)" }} />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3 w-28 rounded animate-pulse" style={{ backgroundColor: "var(--wa-search)" }} />
                  <div className="h-2.5 w-40 rounded animate-pulse" style={{ backgroundColor: "var(--wa-search)" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !filtered?.length && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: "var(--wa-text-secondary)" }}>
            No conversations
          </div>
        )}

        {filtered?.map(conv => {
          const displayName =
            conv.contact
              ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(" ") || conv.contact.phoneNumber
              : conv.whatsappContactId ?? "Unknown";
          const isSelected = selectedId === conv.id;
          const color = avatarColor(displayName);

          return (
            <button
              key={conv.id}
              onClick={() => { void handleSelect(conv.id, displayName); }}
              className="flex items-center gap-3 px-4 py-3 text-left border-b transition-colors w-full"
              style={{
                borderColor: "var(--wa-border)",
                backgroundColor: isSelected ? "var(--wa-active)" : undefined,
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--wa-hover)"; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = ""; }}
            >
              {/* Avatar */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-semibold text-sm select-none"
                style={{ backgroundColor: color }}
              >
                {nameInitials(displayName)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: "var(--wa-text-primary)" }}>
                    {displayName}
                  </span>
                  <span
                    className="text-[11px] shrink-0"
                    style={{ color: conv.unreadCount > 0 ? "var(--wa-green)" : "var(--wa-timestamp)" }}
                  >
                    {formatTime(conv.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs truncate capitalize" style={{ color: "var(--wa-text-secondary)" }}>
                    {conv.status}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span
                      className="min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "var(--wa-green)" }}
                    >
                      {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
