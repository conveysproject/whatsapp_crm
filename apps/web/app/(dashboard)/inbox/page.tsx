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

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const { orgId } = useAuth();

  useSocket(orgId ?? undefined);
  const botActive = useBotStatus(selectedConversationId);

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
    </WhatsAppGate>
  );
}
