"use client";

import { JSX, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { PermissionGate } from "@/components/PermissionGate";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import { WhatsAppGate } from "@/components/WhatsAppGate";
import { useBotStatus } from "@/hooks/useBotStatus";
import { useConversations } from "@/hooks/useConversations";
import { CreateOfferModal } from "@/components/deals/CreateOfferModal";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const [showOffer, setShowOffer] = useState(false);
  const [contactPanelOpen, setContactPanelOpen] = useState(false);

  const botActive = useBotStatus(selectedConversationId);
  const { data: conversations } = useConversations();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const selectedConversation = selectedConversationId
    ? conversations?.find((c) => c.id === selectedConversationId) ?? null
    : null;

  const contact = selectedConversation?.contact ?? null;
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber
    : null;

  const handleStatusChange = useCallback(async (status: string) => {
    if (!selectedConversationId) return;
    const token = await getToken();
    await fetch(`${API_URL}/v1/conversations/${selectedConversationId}/status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [selectedConversationId, getToken, queryClient]);

  const handleLabelChange = useCallback(async (name: string | null) => {
    if (!selectedConversationId) return;
    const token = await getToken();
    if (name) {
      await fetch(`${API_URL}/v1/conversations/${selectedConversationId}/label`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } else {
      await fetch(`${API_URL}/v1/conversations/${selectedConversationId}/label`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    await queryClient.invalidateQueries({ queryKey: ["inbox-labels"] });
  }, [selectedConversationId, getToken, queryClient]);

  return (
    <PermissionGate permission="inbox_access">
    <WhatsAppGate feature="Inbox">
      {/* Conversation sidebar */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col overflow-hidden shrink-0">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />
      </div>

      {/* Main message panel */}
      <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden min-w-0">
        {/* Conversation header */}
        {selectedConversation && contact && contactName ? (
          <ConversationHeader
            conversation={selectedConversation}
            contact={contact}
            contactName={contactName}
            onToggleContactPanel={() => setContactPanelOpen((v) => !v)}
            onStatusChange={handleStatusChange}
            onLabelChange={handleLabelChange}
          />
        ) : selectedConversation && (
          <div className="px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
            <p className="text-sm font-medium text-gray-500">Unknown contact</p>
          </div>
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

        <SendMessageForm
          conversationId={selectedConversationId}
          prefillText={prefillText}
          onSent={() => setPrefillText("")}
          onCreateDeal={contact ? () => setShowOffer(true) : undefined}
          contact={contact}
        />
      </div>

      {/* Contact detail panel */}
      {contactPanelOpen && contact && contactName && selectedConversation && (
        <ContactPanel
          contactId={contact.id}
          contactName={contactName}
          conversationStatus={selectedConversation.status}
          lastMessageAt={selectedConversation.lastMessageAt}
          onCreateDeal={() => setShowOffer(true)}
          onClose={() => setContactPanelOpen(false)}
        />
      )}

      {/* Create deal modal */}
      {showOffer && contact && (
        <CreateOfferModal
          contactId={contact.id}
          contactName={contactName ?? ""}
          onClose={() => setShowOffer(false)}
          onCreated={() => setShowOffer(false)}
        />
      )}
    </WhatsAppGate>
    </PermissionGate>
  );
}
