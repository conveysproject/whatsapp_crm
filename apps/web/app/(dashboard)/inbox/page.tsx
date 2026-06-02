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
import { ContactTrustBadge } from "@/components/trust-score/ContactTrustBadge";

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
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={[
                    "text-xs capitalize",
                    selectedConversation.status === "open" ? "text-green-600" :
                    selectedConversation.status === "pending" ? "text-amber-600" :
                    "text-gray-400",
                  ].join(" ")}>
                    {selectedConversation.status}
                  </span>
                  {contact?.tags && contact.tags.length > 0 && (
                    <>
                      <span className="text-gray-200">·</span>
                      {contact.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="inline-flex items-center h-4 px-1.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">{tag}</span>
                      ))}
                      {contact.tags.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{contact.tags.length - 3}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              {contact && <ContactTrustBadge contactId={contact.id} />}
            </div>
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
          onCreateDeal={contact ? () => setShowOffer(true) : undefined}
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
