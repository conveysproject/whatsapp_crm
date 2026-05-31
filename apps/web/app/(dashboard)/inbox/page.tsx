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
import { useConversations } from "@/hooks/useConversations";
import { CreateOfferModal } from "@/components/deals/CreateOfferModal";

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const [showOffer, setShowOffer] = useState(false);
  const { orgId } = useAuth();

  useSocket(orgId ?? undefined);
  const botActive = useBotStatus(selectedConversationId);
  const { data: conversations } = useConversations();

  const selectedConversation = selectedConversationId
    ? conversations?.find((c) => c.id === selectedConversationId) ?? null
    : null;

  const contact = selectedConversation?.contact ?? null;
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber
    : null;

  return (
    <WhatsAppGate feature="Inbox">
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />
      </div>

      <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden">
        {/* Conversation header — shown when a conversation is selected */}
        {selectedConversation && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-green-700">
                  {(contactName ?? "?")[0]?.toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{contactName ?? contact?.phoneNumber ?? "Unknown"}</p>
                <span className={[
                  "text-xs capitalize",
                  selectedConversation.status === "open" ? "text-green-600" :
                  selectedConversation.status === "pending" ? "text-amber-600" :
                  "text-gray-400",
                ].join(" ")}>
                  {selectedConversation.status}
                </span>
              </div>
            </div>
            {contact && (
              <div className="relative group">
                <button
                  onClick={() => setShowOffer(true)}
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Create Deal"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" />
                  </svg>
                </button>
                <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Create Deal
                </div>
              </div>
            )}
          </div>
        )}

        <MessageThread conversationId={selectedConversationId} />

        {/* Bot responding indicator */}
        {botActive && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Bot is responding…
          </div>
        )}

        <div className="relative px-2 flex items-center gap-2">
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

      {showOffer && contact && (
        <CreateOfferModal
          contactId={contact.id}
          contactName={contactName ?? ""}
          onClose={() => setShowOffer(false)}
          onCreated={() => setShowOffer(false)}
        />
      )}
    </WhatsAppGate>
  );
}
