"use client";

import { JSX, useEffect, useRef } from "react";
import { useMessages } from "@/hooks/useMessages";

interface Props {
  conversationId: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function MessageThread({ conversationId }: Props): JSX.Element {
  const { data: messages, isLoading } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-gray-400">
        Select a conversation to view messages
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-10 w-48 rounded-xl bg-gray-100 animate-pulse ${i % 2 === 0 ? "self-start" : "self-end"}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto flex-1">
      {messages?.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={[
              "max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm",
              msg.direction === "outbound"
                ? "bg-wa-light text-gray-900 rounded-br-none"
                : "bg-white border border-gray-200 text-gray-900 rounded-bl-none shadow-card",
            ].join(" ")}
          >
            <p>{msg.body ?? "[media]"}</p>
            <p className="text-xs text-gray-400 mt-1 text-right">{formatTime(msg.sentAt)}</p>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
