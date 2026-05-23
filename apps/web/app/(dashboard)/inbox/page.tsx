"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";
import { CannedResponsePicker } from "@/components/canned-response-picker";
import { WhatsAppGate } from "@/components/WhatsAppGate";
import { useSocket } from "@/hooks/useSocket";
import { useBotStatus } from "@/hooks/useBotStatus";
import { BotPanel } from "@/components/bot-panel";
import { SmartReplyPanel } from "@/components/smart-reply-panel";

function nameInitials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "?";
}

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState<string>("");
  const [prefillText, setPrefillText] = useState("");
  const { orgId } = useAuth();

  useSocket(orgId ?? undefined);
  const botActive = useBotStatus(selectedConversationId);

  function handleSelect(id: string, displayName: string) {
    setSelectedConversationId(id);
    setSelectedDisplayName(displayName);
  }

  return (
    <WhatsAppGate feature="Inbox">
      {/* Sidebar */}
      <div className="w-80 flex flex-col overflow-hidden border-r" style={{ borderColor: "var(--wa-border)", backgroundColor: "var(--wa-sidebar)" }}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ backgroundColor: "var(--wa-header)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm select-none" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              WB
            </div>
            <span className="text-white font-semibold">Chats</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-full transition-colors text-white/80 hover:text-white" style={{ backgroundColor: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              title="New chat"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button className="p-2 rounded-full transition-colors text-white/80 hover:text-white" style={{ backgroundColor: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              title="Menu"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
          </div>
        </div>

        <ConversationList
          selectedId={selectedConversationId}
          onSelect={handleSelect}
        />
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: "var(--wa-bg)" }}>
        {/* Chat header */}
        {selectedConversationId ? (
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b" style={{ backgroundColor: "var(--wa-header)", borderColor: "var(--wa-border)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm select-none" style={{ backgroundColor: "var(--wa-green)" }}>
                {nameInitials(selectedDisplayName)}
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">{selectedDisplayName}</p>
                <p className="text-white/60 text-xs">WhatsApp</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-full text-white/80 hover:text-white transition-colors" title="Search">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
              </button>
              <button className="p-2 rounded-full text-white/80 hover:text-white transition-colors" title="More">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* Empty state header placeholder */
          <div className="shrink-0 h-[57px]" style={{ backgroundColor: "var(--wa-header)" }} />
        )}

        <MessageThread conversationId={selectedConversationId} />

        {/* Bot responding indicator */}
        {botActive && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs shrink-0">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Bot is responding…
          </div>
        )}

        <div className="relative px-2 flex items-center gap-2 shrink-0">
          <CannedResponsePicker onSelect={(content) => setPrefillText(content)} />
          {selectedConversationId && (
            <SmartReplyPanel
              conversationId={selectedConversationId}
              onSelect={(text) => setPrefillText(text)}
            />
          )}
        </div>

        <SendMessageForm
          conversationId={selectedConversationId}
          prefillText={prefillText}
          onSent={() => setPrefillText("")}
        />

        {selectedConversationId && (
          <BotPanel conversationId={selectedConversationId} />
        )}
      </div>
    </WhatsAppGate>
  );
}
