"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";
import { SmartReplies } from "@/components/inbox/SmartReplies";
import { useSocket } from "@/hooks/useSocket";

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const { orgId } = useAuth();

  useSocket(orgId ?? undefined);

  return (
    <>
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
        <SmartReplies
          conversationId={selectedConversationId}
          onSelect={(text) => setPrefillText(text)}
        />
        <SendMessageForm
          conversationId={selectedConversationId}
          prefillText={prefillText}
          onSent={() => setPrefillText("")}
        />
      </div>
    </>
  );
}
