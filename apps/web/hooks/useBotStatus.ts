"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

export function useBotStatus(conversationId: string | null): boolean {
  const [botActive, setBotActive] = useState(false);

  useEffect(() => {
    if (!conversationId) { setBotActive(false); return; }
    const socket = getSocket();

    function onTriggered(data: { conversationId: string }) {
      if (data.conversationId === conversationId) setBotActive(true);
    }
    function onCompleted(data: { conversationId: string }) {
      if (data.conversationId === conversationId) setBotActive(false);
    }

    socket.on("bot:triggered", onTriggered);
    socket.on("bot:completed", onCompleted);
    return () => {
      socket.off("bot:triggered", onTriggered);
      socket.off("bot:completed", onCompleted);
    };
  }, [conversationId]);

  return botActive;
}
